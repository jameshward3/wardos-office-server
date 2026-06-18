from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Optional
from urllib.parse import urljoin
from urllib.request import Request, urlopen

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


CITY_CALENDAR_URL = "https://orangenj.gov/Calendar.aspx"
ICAL_BASE_URL = "https://orangenj.gov/common/modules/iCalendar/iCalendar.aspx"
DATA_DIR = Path(os.getenv("WARDOS_DATA_DIR", "/app/data"))
CACHE_PATH = DATA_DIR / "city_calendar" / "latest.json"

CITY_CALENDAR_FEEDS = [
    {"name": "Council Meetings", "cat_id": 23, "event_type": "meeting"},
    {"name": "Events Calendar", "cat_id": 14, "event_type": "city_event"},
    {"name": "Planning Board", "cat_id": 28, "event_type": "meeting"},
    {"name": "Zoning Board of Adjustment", "cat_id": 27, "event_type": "meeting"},
    {"name": "Boards & Commissions", "cat_id": 26, "event_type": "meeting"},
    {"name": "Board of Alcohol Beverage Control", "cat_id": 30, "event_type": "meeting"},
    {"name": "Affirmative Action Committee", "cat_id": 32, "event_type": "meeting"},
    {"name": "Community Services", "cat_id": 33, "event_type": "city_event"},
    {"name": "Cultural Affairs", "cat_id": 34, "event_type": "city_event"},
    {"name": "Historic Preservation Commission", "cat_id": 29, "event_type": "meeting"},
    {"name": "Older Adults", "cat_id": 24, "event_type": "city_event"},
    {"name": "Orange Library Board Meetings", "cat_id": 35, "event_type": "meeting"},
    {"name": "Recreation Calendar", "cat_id": 25, "event_type": "city_event"},
]


def feed_url(cat_id: int) -> str:
    return f"{ICAL_BASE_URL}?catID={cat_id}&feed=calendar"


def unfold_ical(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw_line.startswith((" ", "\t")) and lines:
            lines[-1] += raw_line[1:]
        else:
            lines.append(raw_line)
    return lines


def unescape_ical(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .strip()
    )


def clean_markup(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value or "")).strip()


def compact_location(value: str) -> str:
    cleaned = clean_markup(value)
    if not cleaned:
        return ""
    if "zoom" in cleaned.lower() or "join meeting" in cleaned.lower():
        return "Virtual meeting"
    return cleaned[:255]


def parse_ical_datetime(value: str) -> Optional[datetime]:
    value = value.strip()
    if not value:
        return None
    for fmt in ("%Y%m%dT%H%M%SZ", "%Y%m%dT%H%M%S", "%Y%m%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def parse_ical_feed(text: str, feed: dict) -> list[dict]:
    events: list[dict] = []
    current: dict | None = None
    for line in unfold_ical(text):
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current:
                events.append(normalize_ical_event(current, feed))
            current = None
            continue
        if current is None or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key_name = key.split(";", 1)[0].upper()
        current[key_name] = unescape_ical(value)
    return events


def normalize_ical_event(raw: dict, feed: dict) -> dict:
    uid = raw.get("UID") or f"{feed['cat_id']}-{raw.get('SUMMARY', '')}-{raw.get('DTSTART', '')}"
    starts_at = parse_ical_datetime(raw.get("DTSTART", ""))
    ends_at = parse_ical_datetime(raw.get("DTEND", ""))
    title = raw.get("SUMMARY") or f"{feed['name']} Event"
    url = raw.get("URL") or CITY_CALENDAR_URL
    description = clean_markup(raw.get("DESCRIPTION", ""))
    raw_location = clean_markup(raw.get("LOCATION", ""))
    location = compact_location(raw_location)
    source_id = f"orange-city-calendar-{re.sub(r'[^A-Za-z0-9_.-]+', '-', uid)[:180]}"
    return {
        "source_id": source_id,
        "uid": uid,
        "title": title,
        "starts_at": starts_at.isoformat() if starts_at else None,
        "ends_at": ends_at.isoformat() if ends_at else None,
        "location": location,
        "event_type": feed["event_type"],
        "calendar": feed["name"],
        "calendars": [feed["name"]],
        "category_id": feed["cat_id"],
        "category_ids": [feed["cat_id"]],
        "status": "posted",
        "source_url": urljoin(CITY_CALENDAR_URL, url),
        "description": description,
        "raw_location": raw_location,
    }


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "WardOS/1.0 local office monitor"})
    with urlopen(request, timeout=20) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def fetch_city_calendar(feeds: Optional[list[dict]] = None) -> dict:
    selected_feeds = feeds or CITY_CALENDAR_FEEDS
    all_events = []
    feed_results = []
    for feed in selected_feeds:
        url = feed_url(feed["cat_id"])
        text = fetch_text(url)
        events = parse_ical_feed(text, feed)
        all_events.extend(events)
        feed_results.append({"name": feed["name"], "cat_id": feed["cat_id"], "url": url, "event_count": len(events)})

    deduped_events = dedupe_events(all_events)
    payload = {
        "source_url": CITY_CALENDAR_URL,
        "fetched_at": datetime.now().isoformat(),
        "feed_count": len(feed_results),
        "event_count": len(deduped_events),
        "feeds": feed_results,
        "events": deduped_events,
    }
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def dedupe_events(events: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for event in events:
        key = event["uid"]
        if key not in merged:
            merged[key] = event
            continue
        current = merged[key]
        current["calendars"] = sorted(set(current.get("calendars", [current["calendar"]]) + event.get("calendars", [event["calendar"]])))
        current["category_ids"] = sorted(set(current.get("category_ids", [current["category_id"]]) + event.get("category_ids", [event["category_id"]])))
        if current["event_type"] != "meeting" and event["event_type"] == "meeting":
            current["event_type"] = "meeting"
            current["calendar"] = event["calendar"]
            current["category_id"] = event["category_id"]
        if not current.get("description") and event.get("description"):
            current["description"] = event["description"]
        if not current.get("location") and event.get("location"):
            current["location"] = event["location"]
    return sorted(merged.values(), key=lambda item: item.get("starts_at") or "")


def load_cached_city_calendar() -> dict:
    if not CACHE_PATH.exists():
        return {"source_url": CITY_CALENDAR_URL, "fetched_at": None, "feed_count": 0, "event_count": 0, "feeds": [], "events": []}
    return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def upsert_city_calendar_events(db: "Session", payload: dict) -> dict:
    from app.models import AuditLog, Event

    imported = 0
    updated = 0
    for item in payload.get("events", []):
        starts_at = datetime.fromisoformat(item["starts_at"]) if item.get("starts_at") else None
        notes = json.dumps(
            {
                "source": "City of Orange Township Calendar",
                "calendar": item["calendar"],
                "calendars": item.get("calendars", [item["calendar"]]),
                "category_id": item["category_id"],
                "category_ids": item.get("category_ids", [item["category_id"]]),
                "source_url": item["source_url"],
                "description": item.get("description", ""),
                "raw_location": item.get("raw_location", ""),
                "ends_at": item.get("ends_at"),
            },
            sort_keys=True,
        )
        existing = db.query(Event).filter(Event.source_id == item["source_id"]).first()
        if existing:
            existing.title = item["title"]
            existing.starts_at = starts_at
            existing.location = item["location"]
            existing.event_type = item["event_type"]
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
                    event_type=item["event_type"],
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
            entity_type="city_calendar",
            detail=f"Fetched {payload.get('event_count', 0)} city calendar events; imported {imported}; updated {updated}",
        )
    )
    db.commit()
    return {"imported": imported, "updated": updated, "event_count": payload.get("event_count", 0)}
