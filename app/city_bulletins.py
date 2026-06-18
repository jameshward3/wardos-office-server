from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


CITY_HOME_URL = "https://orangenj.gov/"
DATA_DIR = Path(os.getenv("WARDOS_DATA_DIR", "/app/data"))
CACHE_PATH = DATA_DIR / "city_bulletins" / "latest.json"

IGNORED_LINK_TEXT = {
    "",
    "read on...",
    "home",
    "search",
    "residents",
    "business",
    "uez program",
    "how do i...",
    "city government",
    "departments",
    "website sign in",
    "create a website account",
    "bill pay",
    "agendas & minutes",
    "job openings",
    "documents & forms",
    "notify me",
    "all events",
    "meetings",
    "older adults",
    "recreation",
    "view all events",
    "contact us",
    "site map",
    "accessibility",
    "copyright notices",
    "privacy policy",
}


class HomepageLinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[dict] = []
        self.current_link: dict | None = None
        self.heading_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        attrs_dict = dict(attrs)
        if tag == "a" and attrs_dict.get("href"):
            self.current_link = {"href": attrs_dict["href"], "text": "", "image_alt": ""}
        elif tag == "img" and self.current_link is not None:
            alt = attrs_dict.get("alt", "")
            if alt:
                self.current_link["image_alt"] = alt

    def handle_endtag(self, tag: str):
        if tag == "a" and self.current_link is not None:
            self.links.append(self.current_link)
            self.current_link = None

    def handle_data(self, data: str):
        if self.current_link is not None:
            self.current_link["text"] += f" {data}"


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "WardOS/1.0 local office monitor"})
    with urlopen(request, timeout=20) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def bulletin_source_id(url: str, title: str) -> str:
    digest = hashlib.sha1(f"{url}|{title}".encode("utf-8")).hexdigest()[:16]
    return f"orange-home-bulletin-{digest}"


def classify_bulletin(title: str, url: str) -> str:
    title_l = title.lower()
    url_l = url.lower()
    if "emergency alert" in title_l or "alertcenter" in url_l:
        return "emergency_alert"
    if "public notice" in title_l or "public-notice" in url_l:
        return "public_notice"
    if "civicalerts" in url_l:
        return "civic_alert"
    if "calendar" in url_l:
        return "event_link"
    return "homepage"


def useful_bulletin_link(title: str, url: str) -> bool:
    title_l = title.lower()
    parsed = urlparse(url)
    path_l = parsed.path.lower()
    if title_l in IGNORED_LINK_TEXT:
        return False
    if title_l == "create an account" or "create an account" in title_l:
        return False
    if "civicalerts.aspx" in path_l and (parsed.query or title_l not in {"", "read on..."}):
        return True
    if "alertcenter.aspx" in path_l or "emergency alert" in title_l:
        return True
    return False


def prefer_bulletin_title(existing: dict, new_title: str) -> bool:
    existing_title = existing["title"].lower()
    new_title_l = new_title.lower()
    existing_raw = existing["title"]
    if existing_title.endswith((".pdf", ".jpg", ".png")) and not new_title_l.endswith((".pdf", ".jpg", ".png")):
        return True
    if existing_title.startswith("image:") and not new_title_l.startswith("image:"):
        return True
    if existing_raw.isupper() and not new_title.isupper():
        return True
    return len(new_title) > len(existing["title"]) and not new_title_l.endswith((".pdf", ".jpg", ".png"))


def parse_homepage_bulletins(html: str, source_url: str = CITY_HOME_URL) -> list[dict]:
    parser = HomepageLinkParser()
    parser.feed(html)
    by_url: dict[str, dict] = {}
    for link in parser.links:
        text = clean_text(link.get("text", ""))
        image_alt = clean_text(link.get("image_alt", ""))
        href = urljoin(source_url, link["href"])
        title = text if text.lower() != "read on..." else image_alt
        title = title or image_alt
        if not useful_bulletin_link(title, href):
            continue
        existing = by_url.get(href)
        if existing and not prefer_bulletin_title(existing, title):
            continue
        by_url[href] = {
            "source_id": bulletin_source_id(href, title),
            "title": title,
            "bulletin_type": classify_bulletin(title, href),
            "url": href,
            "summary": image_alt if image_alt and image_alt != title else "",
            "status": "posted",
            "source_url": source_url,
        }
    return sorted(by_url.values(), key=lambda item: (item["bulletin_type"], item["title"]))


def fetch_city_bulletins(source_url: str = CITY_HOME_URL) -> dict:
    html = fetch_text(source_url)
    bulletins = parse_homepage_bulletins(html, source_url)
    payload = {
        "source_url": source_url,
        "fetched_at": datetime.now().isoformat(),
        "bulletin_count": len(bulletins),
        "bulletins": bulletins,
    }
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def load_cached_city_bulletins() -> dict:
    if not CACHE_PATH.exists():
        return {"source_url": CITY_HOME_URL, "fetched_at": None, "bulletin_count": 0, "bulletins": []}
    return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def upsert_city_bulletins(db: "Session", payload: dict) -> dict:
    from app.models import AuditLog, CityBulletin

    imported = 0
    updated = 0
    now = datetime.utcnow()
    for item in payload.get("bulletins", []):
        existing = db.query(CityBulletin).filter(CityBulletin.source_id == item["source_id"]).first()
        if existing:
            existing.title = item["title"]
            existing.bulletin_type = item["bulletin_type"]
            existing.url = item["url"]
            existing.summary = item.get("summary", "")
            existing.status = item["status"]
            existing.source_url = item["source_url"]
            existing.last_seen_at = now
            updated += 1
        else:
            db.add(CityBulletin(**item, first_seen_at=now, last_seen_at=now))
            imported += 1
    db.add(
        AuditLog(
            actor="wardos_scheduler",
            action="sync",
            entity_type="city_bulletins",
            detail=f"Fetched {payload.get('bulletin_count', 0)} city homepage bulletins; imported {imported}; updated {updated}",
        )
    )
    db.commit()
    return {"imported": imported, "updated": updated, "bulletin_count": payload.get("bulletin_count", 0)}
