from __future__ import annotations

import json
import os
import re
from datetime import datetime, time
from html.parser import HTMLParser
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urljoin
from urllib.request import Request, urlopen

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


COUNCIL_MEETINGS_URL = "https://orangetwpnjcc.org/meetings/2026-meetings-2/"
DATA_DIR = Path(os.getenv("WARDOS_DATA_DIR", "/app/data"))
CACHE_PATH = DATA_DIR / "council_meetings" / "latest.json"
LEGISLATION_CACHE_PATH = DATA_DIR / "legislation" / "latest.json"


def meeting_source_id(meeting_date) -> str:
    return f"orange-city-council-2026-{meeting_date.isoformat()}"


def parse_meeting_date(value: str):
    value = re.sub(r"\s+", " ", value or "").strip()
    try:
        return datetime.strptime(value, "%B %d, %Y").date()
    except ValueError:
        return None


def classify_document(text: str, context: str, href: str = "") -> tuple[str, str]:
    text_l = text.lower()
    context_l = context.lower()
    href_l = href.lower()
    haystack = f"{context_l} {text_l} {href_l}"

    if "minutes" in text_l or "minutes" in href_l:
        doc_type = "minutes"
    elif "agenda" in text_l or "agenda" in href_l:
        doc_type = "agenda"
    elif "resolution" in text_l or "resolution" in href_l or re.search(r"\breso", f"{text_l} {href_l}"):
        doc_type = "resolution"
    elif "ordinance" in text_l or "ordinance" in href_l or re.search(r"\bord", f"{text_l} {href_l}"):
        doc_type = "ordinance"
    elif "resolution" in haystack or re.search(r"\breso", haystack):
        doc_type = "resolution"
    elif "ordinance" in haystack or re.search(r"\bord", haystack):
        doc_type = "ordinance"
    else:
        doc_type = "other"

    if "conference" in href_l:
        meeting_type = "conference"
    elif "regular" in href_l:
        meeting_type = "regular"
    elif context_l.rfind("regular") > context_l.rfind("conference"):
        meeting_type = "regular"
    elif "conference" in context_l:
        meeting_type = "conference"
    elif doc_type in {"ordinance", "resolution"}:
        meeting_type = "legislation"
    else:
        meeting_type = "document"

    if doc_type in {"ordinance", "resolution"}:
        meeting_type = "legislation"
    return meeting_type, doc_type


def legislation_status(document_type: str, context: str) -> str:
    haystack = re.sub(r"\s+", " ", context or "").lower()
    if "postponed" in haystack:
        return "postponed"
    if "withdrawn" in haystack:
        return "withdrawn"
    if "ordinances - 1" in haystack or "ordinances – 1" in haystack or "first reading" in haystack:
        return "first_reading"
    if "ordinances - 2" in haystack or "ordinances – 2" in haystack or "second reading" in haystack:
        return "second_reading"
    if document_type == "resolution":
        return "resolution_pending"
    return "tracking"


def bill_number_from_text(text: str, doc_type: str) -> str:
    normalized = re.sub(r"\s+", " ", text or "").strip()
    patterns = [
        r"\b(?:ord(?:inance)?|reso(?:lution)?)\s*[-#:]*\s*([a-z]?\s*\d{1,4}\s*[-/]\s*\d{2,4}[a-z]?)\b",
        r"\b([a-z]?\s*\d{1,4}\s*[-/]\s*\d{2,4}[a-z]?)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            value = re.sub(r"\s+", "", match.group(1).upper()).replace("/", "-")
            prefix = "ORD" if doc_type == "ordinance" else "RES"
            if value.startswith(("ORD", "RES")):
                return value
            return f"{prefix}-{value}"
    return ""


def legislation_title_from_text(text: str) -> str:
    cleaned = re.sub(r"\.pdf\b", "", text or "", flags=re.IGNORECASE).strip(" -:")
    cleaned = re.sub(r"\b(?:ORD(?:INANCE)?|RESO(?:LUTION)?)\s*[-#:]*\s*[A-Z]?\s*\d{1,4}\s*[-/]\s*\d{2,4}[A-Z]?\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:")
    return cleaned or "Untitled legislation item"


def legislation_source_id(href: str, bill_number: str, meeting_date: str, index: int) -> str:
    slug = bill_number or href.rsplit("/", 1)[-1] or f"item-{index}"
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", slug).strip("-").lower()
    return f"orange-legislation-{meeting_date}-{slug}"


class CouncilMeetingsParser(HTMLParser):
    def __init__(self, source_url: str):
        super().__init__(convert_charrefs=True)
        self.source_url = source_url
        self.meetings: list[dict] = []
        self.current_meeting: dict | None = None
        self.in_h4 = False
        self.h4_text: list[str] = []
        self.current_link: dict | None = None
        self.context_buffer = ""

    def handle_starttag(self, tag: str, attrs):
        attrs_dict = dict(attrs)
        if tag == "h4":
            self.finish_current_meeting()
            self.in_h4 = True
            self.h4_text = []
            self.context_buffer = ""
        elif tag == "a" and self.current_meeting and attrs_dict.get("href"):
            self.current_link = {"href": attrs_dict["href"], "text": "", "context": self.context_buffer[-300:]}

    def handle_endtag(self, tag: str):
        if tag == "h4" and self.in_h4:
            self.in_h4 = False
            meeting_date = parse_meeting_date(" ".join(self.h4_text))
            if meeting_date:
                self.current_meeting = {
                    "source_id": meeting_source_id(meeting_date),
                    "date": meeting_date.isoformat(),
                    "title": f"Orange City Council Meeting - {meeting_date.strftime('%B %d, %Y')}",
                    "location": "Orange City Council",
                    "status": "scheduled",
                    "source_url": self.source_url,
                    "documents": [],
                    "summary": "",
                    "_summary_parts": [],
                }
        elif tag == "a" and self.current_link and self.current_meeting:
            text = re.sub(r"\s+", " ", self.current_link["text"]).strip() or "Document"
            href = urljoin(self.source_url, self.current_link["href"])
            context = self.current_link["context"]
            meeting_type, doc_type = classify_document(text, context, href)
            self.current_meeting["documents"].append(
                {
                    "title": text,
                    "url": href,
                    "meeting_type": meeting_type,
                    "document_type": doc_type,
                }
            )
            self.current_meeting["status"] = "posted"
            self.current_link = None

    def handle_data(self, data: str):
        text = re.sub(r"\s+", " ", data or " ").strip()
        if not text:
            return
        if self.in_h4:
            self.h4_text.append(text)
            return
        if self.current_link is not None:
            self.current_link["text"] += f" {text}"
        if self.current_meeting:
            self.context_buffer = f"{self.context_buffer} {text}"[-1000:]
            self.current_meeting["_summary_parts"].append(text)

    def finish_current_meeting(self):
        if not self.current_meeting:
            return
        self.current_meeting["summary"] = " ".join(self.current_meeting.pop("_summary_parts", []))[:2000]
        self.meetings.append(self.current_meeting)
        self.current_meeting = None


def parse_council_meetings(html: str, source_url: str = COUNCIL_MEETINGS_URL) -> list[dict]:
    parser = CouncilMeetingsParser(source_url)
    parser.feed(html)
    parser.finish_current_meeting()
    return parser.meetings


def fetch_council_meetings(source_url: str = COUNCIL_MEETINGS_URL) -> dict:
    request = Request(source_url, headers={"User-Agent": "WardOS/1.0 local office monitor"})
    with urlopen(request, timeout=20) as response:
        html = response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")
    meetings = parse_council_meetings(html, source_url)
    payload = {
        "source_url": source_url,
        "fetched_at": datetime.now().isoformat(),
        "meeting_count": len(meetings),
        "meetings": meetings,
    }
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def load_cached_council_meetings() -> dict:
    if not CACHE_PATH.exists():
        return {"source_url": COUNCIL_MEETINGS_URL, "fetched_at": None, "meeting_count": 0, "meetings": []}
    return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def extract_legislation_items(payload: dict) -> dict:
    items: list[dict] = []
    for meeting in payload.get("meetings", []):
        meeting_date = meeting.get("date") or ""
        for index, document in enumerate(meeting.get("documents", []), start=1):
            if document.get("document_type") not in {"ordinance", "resolution"}:
                continue
            context = " ".join(filter(None, [meeting.get("summary", ""), document.get("title", "")]))
            doc_type = document.get("document_type", "other")
            bill_number = bill_number_from_text(document.get("title", ""), doc_type)
            items.append(
                {
                    "source_id": legislation_source_id(document.get("url", ""), bill_number, meeting_date, index),
                    "bill_number": bill_number or f"{doc_type[:3].upper()}-{meeting_date}-{index}",
                    "title": legislation_title_from_text(document.get("title", "")),
                    "status": legislation_status(doc_type, context),
                    "hearing_date": meeting_date,
                    "source_url": document.get("url", "") or meeting.get("source_url", ""),
                    "meeting_title": meeting.get("title", ""),
                    "document_type": doc_type,
                    "notes": {
                        "meeting_title": meeting.get("title", ""),
                        "meeting_date": meeting_date,
                        "location": meeting.get("location", ""),
                        "source_page": meeting.get("source_url", ""),
                        "summary": meeting.get("summary", ""),
                    },
                }
            )
    legislation_payload = {
        "source_url": payload.get("source_url", COUNCIL_MEETINGS_URL),
        "fetched_at": payload.get("fetched_at"),
        "item_count": len(items),
        "items": items,
    }
    LEGISLATION_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    LEGISLATION_CACHE_PATH.write_text(json.dumps(legislation_payload, indent=2), encoding="utf-8")
    return legislation_payload


def load_cached_legislation() -> dict:
    if not LEGISLATION_CACHE_PATH.exists():
        return {"source_url": COUNCIL_MEETINGS_URL, "fetched_at": None, "item_count": 0, "items": []}
    return json.loads(LEGISLATION_CACHE_PATH.read_text(encoding="utf-8"))


def upsert_council_meetings(db: "Session", payload: dict) -> dict:
    from app.models import AuditLog, Event

    imported = 0
    updated = 0
    for item in payload.get("meetings", []):
        starts_at = datetime.combine(datetime.fromisoformat(item["date"]).date(), time(0, 0))
        notes = json.dumps(
            {
                "source": "Orange City Council 2026 Meetings",
                "source_url": item["source_url"],
                "documents": item["documents"],
                "summary": item.get("summary", ""),
                "time_note": "Meeting time is not listed on the source page.",
            },
            sort_keys=True,
        )
        existing = db.query(Event).filter(Event.source_id == item["source_id"]).first()
        if existing:
            existing.title = item["title"]
            existing.starts_at = starts_at
            existing.location = item["location"]
            existing.event_type = "meeting"
            existing.status = item["status"]
            existing.notes = notes
            existing.source_url = item["source_url"]
            updated += 1
        else:
            db.add(
                Event(
                    title=item["title"],
                    starts_at=starts_at,
                    location=item["location"],
                    event_type="meeting",
                    status=item["status"],
                    notes=notes,
                    source_url=item["source_url"],
                    source_id=item["source_id"],
                )
            )
            imported += 1
    db.add(
        AuditLog(
            actor="wardos_scheduler",
            action="sync",
            entity_type="council_meetings",
            detail=f"Fetched {payload.get('meeting_count', 0)} meetings from Orange City Council; imported {imported}; updated {updated}",
        )
    )
    db.commit()
    return {"imported": imported, "updated": updated, "meeting_count": payload.get("meeting_count", 0)}


def upsert_legislation_items(db: "Session", payload: dict) -> dict:
    from app.models import AuditLog, LegislationItem

    imported = 0
    updated = 0
    for item in payload.get("items", []):
        hearing_date = None
        if item.get("hearing_date"):
            hearing_date = datetime.fromisoformat(item["hearing_date"]).date()
        notes = json.dumps(item.get("notes", {}), sort_keys=True)
        existing = db.query(LegislationItem).filter(LegislationItem.source_id == item["source_id"]).first()
        if existing:
            existing.bill_number = item["bill_number"]
            existing.title = item["title"]
            existing.status = item["status"]
            existing.hearing_date = hearing_date
            existing.source_url = item["source_url"]
            existing.notes = notes
            updated += 1
        else:
            db.add(
                LegislationItem(
                    bill_number=item["bill_number"],
                    title=item["title"],
                    status=item["status"],
                    hearing_date=hearing_date,
                    source_url=item["source_url"],
                    source_id=item["source_id"],
                    notes=notes,
                )
            )
            imported += 1
    db.add(
        AuditLog(
            actor="wardos_scheduler",
            action="sync",
            entity_type="legislation_items",
            detail=f"Fetched {payload.get('item_count', 0)} legislation items from Orange meetings page; imported {imported}; updated {updated}",
        )
    )
    db.commit()
    return {"imported": imported, "updated": updated, "item_count": payload.get("item_count", 0)}
