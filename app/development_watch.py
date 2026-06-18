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


PLANNING_BOARD_URL = "https://orangetwpnjcc.org/boards-commissions/planning-board/"
ZONING_BOARD_URL = "https://orangetwpnjcc.org/boards-commissions/zoning-board-of-adjustment/"
DATA_DIR = Path(os.getenv("WARDOS_DATA_DIR", "/app/data"))
CACHE_PATH = DATA_DIR / "development_watch" / "latest.json"

BOARD_SOURCES = [
    {
        "board": "Planning Board",
        "slug": "planning-board",
        "url": PLANNING_BOARD_URL,
        "default_location": "Orange Planning Board",
    },
    {
        "board": "Zoning Board of Adjustment",
        "slug": "zoning-board",
        "url": ZONING_BOARD_URL,
        "default_location": "Orange Zoning Board of Adjustment",
    },
]

MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
DATE_RE = re.compile(rf"\b(?:{'|'.join(MONTHS)})\s+\d{{1,2}}(?:,\s+\d{{4}})?\b")
ADDRESS_RE = re.compile(
    r"\b\d{1,5}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){0,5}\s+"
    r"(?:St|Street|Ave|Avenue|Av|Rd|Road|Dr|Drive|Blvd|Boulevard|Pl|Place|Ct|Court|Ln|Lane|Ter|Terrace|Way)\b",
    re.IGNORECASE,
)


class BoardPageParser(HTMLParser):
    def __init__(self, source_url: str):
        super().__init__(convert_charrefs=True)
        self.source_url = source_url
        self.tokens: list[dict] = []
        self.current_link: dict | None = None
        self.current_heading = ""
        self.heading_tag: str | None = None

    def handle_starttag(self, tag: str, attrs):
        attrs_dict = dict(attrs)
        if tag in {"h1", "h2", "h3", "h4"}:
            self.heading_tag = tag
            self.current_heading = ""
        if tag == "a" and attrs_dict.get("href"):
            self.current_link = {"href": attrs_dict["href"], "text": ""}

    def handle_endtag(self, tag: str):
        if tag == self.heading_tag:
            text = clean_text(self.current_heading)
            if text:
                self.tokens.append({"kind": "heading", "text": text})
            self.heading_tag = None
            self.current_heading = ""
        if tag == "a" and self.current_link:
            text = clean_text(self.current_link["text"]) or "Open Source"
            self.tokens.append(
                {
                    "kind": "link",
                    "text": text,
                    "url": urljoin(self.source_url, self.current_link["href"]),
                }
            )
            self.current_link = None

    def handle_data(self, data: str):
        text = clean_text(data)
        if not text:
            return
        if self.heading_tag:
            self.current_heading = f"{self.current_heading} {text}"
        if self.current_link:
            self.current_link["text"] = f"{self.current_link['text']} {text}"
            return
        self.tokens.append({"kind": "text", "text": text})


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "WardOS/1.0 local development monitor"})
    with urlopen(request, timeout=20) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def parse_date(value: str, fallback_year: int = 2026):
    text = clean_text(value)
    if not re.search(r"\d{4}", text):
        text = f"{text}, {fallback_year}"
    try:
        return datetime.strptime(text, "%B %d, %Y").date()
    except ValueError:
        return None


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:180] or "item"


def classify_document(title: str, url: str) -> str:
    haystack = f"{title} {url}".lower()
    if "agenda" in haystack:
        return "agenda"
    if "minute" in haystack:
        return "minutes"
    if "notice" in haystack:
        return "notice"
    if "application" in haystack or "applicant" in haystack:
        return "application"
    if "resolution" in haystack:
        return "resolution"
    if "redevelopment" in haystack or "plan" in haystack:
        return "redevelopment"
    return "source"


def should_watch_document(document: dict) -> bool:
    doc_type = document.get("document_type", "")
    title = document.get("title", "").lower()
    return doc_type in {"application", "resolution", "redevelopment", "notice"} or any(
        term in title for term in ("site plan", "variance", "application", "redevelopment", "subdivision")
    )


def extract_address(value: str) -> str:
    match = ADDRESS_RE.search(value or "")
    return clean_text(match.group(0)) if match else ""


def append_meeting(meetings: dict, source: dict, meeting_date, documents=None):
    source_id = f"orange-{source['slug']}-{meeting_date.isoformat()}"
    meeting = meetings.setdefault(
        source_id,
        {
            "source_id": source_id,
            "date": meeting_date.isoformat(),
            "title": f"{source['board']} Meeting - {meeting_date.strftime('%B %d, %Y')}",
            "board": source["board"],
            "location": source["default_location"],
            "status": "scheduled",
            "source_url": source["url"],
            "documents": [],
        },
    )
    for document in documents or []:
        if document not in meeting["documents"]:
            meeting["documents"].append(document)
            meeting["status"] = "posted"
    return meeting


def parse_board_page(html: str, source: dict) -> dict:
    parser = BoardPageParser(source["url"])
    parser.feed(html)

    meetings: dict[str, dict] = {}
    watch_items: dict[str, dict] = {}
    current_year = 2026
    current_date = None
    current_section = ""
    recent_text: list[str] = []

    for token in parser.tokens:
        text = token.get("text", "")
        if re.fullmatch(r"20\d{2}", text):
            current_year = int(text)
        if token["kind"] == "heading":
            current_section = text
        recent_text = (recent_text + [text])[-8:]

        for date_text in DATE_RE.findall(text):
            parsed = parse_date(date_text, current_year)
            if parsed:
                current_date = parsed
                append_meeting(meetings, source, parsed)

        if token["kind"] != "link":
            continue

        doc_type = classify_document(text, token["url"])
        if not current_date:
            current_date = parse_date(text, current_year)
        document = {
            "title": text,
            "url": token["url"],
            "document_type": doc_type,
            "section": current_section,
        }
        if current_date:
            meeting = append_meeting(meetings, source, current_date, [document])
        else:
            meeting = None

        if should_watch_document(document):
            context = " ".join(recent_text)
            source_id = f"orange-development-{source['slug']}-{slugify(text)}"
            watch_items[source_id] = {
                "source_id": source_id,
                "name": text,
                "address": extract_address(context) or extract_address(text),
                "project_type": doc_type,
                "status": "source posted",
                "board": source["board"],
                "source_url": token["url"],
                "meeting_date": meeting["date"] if meeting else None,
                "notes": json.dumps(
                    {
                        "board": source["board"],
                        "section": current_section,
                        "document_type": doc_type,
                        "source_url": token["url"],
                        "meeting_source_id": meeting["source_id"] if meeting else "",
                    },
                    sort_keys=True,
                ),
            }

    return {
        "board": source["board"],
        "source_url": source["url"],
        "meetings": sorted(meetings.values(), key=lambda item: item["date"]),
        "watch_items": sorted(watch_items.values(), key=lambda item: (item.get("meeting_date") or "", item["name"])),
    }


def fetch_development_watch() -> dict:
    boards = []
    meetings = []
    watch_items = []
    for source in BOARD_SOURCES:
        html = fetch_text(source["url"])
        board_payload = parse_board_page(html, source)
        boards.append(
            {
                "board": board_payload["board"],
                "source_url": board_payload["source_url"],
                "meeting_count": len(board_payload["meetings"]),
                "watch_count": len(board_payload["watch_items"]),
            }
        )
        meetings.extend(board_payload["meetings"])
        watch_items.extend(board_payload["watch_items"])

    payload = {
        "source_url": "Orange Township Planning and Zoning Board pages",
        "fetched_at": datetime.now().isoformat(),
        "boards": boards,
        "meeting_count": len(meetings),
        "watch_count": len(watch_items),
        "meetings": sorted(meetings, key=lambda item: item["date"]),
        "watch_items": watch_items,
    }
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def load_cached_development_watch() -> dict:
    if not CACHE_PATH.exists():
        return {
            "source_url": "Orange Township Planning and Zoning Board pages",
            "fetched_at": None,
            "boards": [],
            "meeting_count": 0,
            "watch_count": 0,
            "meetings": [],
            "watch_items": [],
        }
    return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def upsert_development_watch(db: "Session", payload: dict) -> dict:
    from app.models import AuditLog, DevelopmentProject, Event

    imported_meetings = 0
    updated_meetings = 0
    imported_watch_items = 0
    updated_watch_items = 0

    for item in payload.get("meetings", []):
        starts_at = datetime.combine(datetime.fromisoformat(item["date"]).date(), time(0, 0))
        notes = json.dumps(
            {
                "source": "Orange Township board development watch",
                "board": item["board"],
                "source_url": item["source_url"],
                "documents": item.get("documents", []),
                "time_note": "Meeting time is not listed on the board source page.",
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
            updated_meetings += 1
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
            imported_meetings += 1

    for item in payload.get("watch_items", []):
        existing = db.query(DevelopmentProject).filter(DevelopmentProject.source_id == item["source_id"]).first()
        if existing:
            existing.name = item["name"]
            existing.address = item["address"]
            existing.project_type = item["project_type"]
            existing.status = item["status"]
            existing.board = item["board"]
            existing.notes = item["notes"]
            existing.source_url = item["source_url"]
            updated_watch_items += 1
        else:
            db.add(
                DevelopmentProject(
                    name=item["name"],
                    address=item["address"],
                    project_type=item["project_type"],
                    status=item["status"],
                    board=item["board"],
                    notes=item["notes"],
                    source_url=item["source_url"],
                    source_id=item["source_id"],
                )
            )
            imported_watch_items += 1

    db.add(
        AuditLog(
            actor="wardos_scheduler",
            action="sync",
            entity_type="development_watch",
            detail=f"Imported {imported_meetings} meetings and {imported_watch_items} watch items",
        )
    )
    db.commit()
    return {
        "imported_meetings": imported_meetings,
        "updated_meetings": updated_meetings,
        "imported_watch_items": imported_watch_items,
        "updated_watch_items": updated_watch_items,
    }
