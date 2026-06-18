import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.request import Request, urlopen

from app.media_config import load_media_config

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


DATA_DIR = Path(os.getenv("WARDOS_DATA_DIR", "/app/data"))
CACHE_PATH = DATA_DIR / "media_monitor" / "latest.json"
ORANGE_TERMS = (
    "orange",
    "south ward",
    "essex",
    "city council",
    "planning board",
    "zoning board",
    "redevelopment",
    "pilot",
    "parking",
    "traffic",
    "trees",
    "budget",
)


def clean_text(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", unescape(text)).strip()


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "WardOS/1.0 local media monitor"})
    with urlopen(request, timeout=20) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def parse_rss_datetime(value: str):
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        return parsed.replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def child_text(item, names: set[str]) -> str:
    for child in list(item):
        if local_name(child.tag) in names:
            return clean_text(child.text or "")
    return ""


def child_link(item) -> str:
    link = child_text(item, {"link"})
    if link:
        return link
    for child in list(item):
        if local_name(child.tag) == "link":
            href = child.attrib.get("href", "")
            if href:
                return href
    return ""


def parse_feed(xml_text: str, source: dict) -> list[dict]:
    root = ET.fromstring(xml_text)
    items = [node for node in root.iter() if local_name(node.tag) in {"item", "entry"}]
    rows = []
    for item in items[:50]:
        title = child_text(item, {"title"})
        url = child_link(item)
        summary = child_text(item, {"description", "summary", "content", "encoded"})
        published_raw = child_text(item, {"pubdate", "published", "updated", "dc:date"})
        haystack = f"{title} {summary}".lower()
        if not any(term in haystack for term in ORANGE_TERMS):
            continue
        rows.append(
            {
                "source": source["name"],
                "source_type": source.get("type", "news"),
                "headline": title or "Untitled media item",
                "summary": summary[:1200],
                "url": url,
                "sentiment": "neutral",
                "topic": infer_topic(haystack),
                "geographic_tag": "Orange / Essex County" if "orange" in haystack or "essex" in haystack else "",
                "engagement_score": 0,
                "published_at": parse_rss_datetime(published_raw),
            }
        )
    return rows


def infer_topic(haystack: str) -> str:
    topic_terms = [
        ("Traffic", ("traffic", "parking", "road", "street")),
        ("Development", ("development", "redevelopment", "planning", "zoning", "variance")),
        ("Budget", ("budget", "tax", "pilot")),
        ("Trees", ("tree", "canopy")),
        ("Public Safety", ("police", "fire", "safety", "crime")),
        ("Schools", ("school", "education", "students")),
    ]
    for topic, terms in topic_terms:
        if any(term in haystack for term in terms):
            return topic
    return "Community"


def configured_rss_sources() -> list[dict]:
    rows = []
    config = load_media_config()
    for item in config.get("local_news", []):
        if item.get("rss"):
            rows.append(item)
    return rows


def fetch_media_mentions() -> dict:
    sources = configured_rss_sources()
    mentions = []
    source_results = []
    for source in sources:
        try:
            rows = parse_feed(fetch_text(source["rss"]), source)
            mentions.extend(rows)
            source_results.append({"name": source["name"], "url": source["rss"], "status": "ok", "mention_count": len(rows)})
        except Exception as exc:  # noqa: BLE001 - sync should report source failures and continue.
            source_results.append({"name": source["name"], "url": source["rss"], "status": "error", "error": str(exc)})

    payload = {
        "source_url": "WardOS configured RSS media sources",
        "fetched_at": datetime.now().isoformat(),
        "source_count": len(sources),
        "mention_count": len(mentions),
        "sources": source_results,
        "mentions": [
            {
                **row,
                "published_at": row["published_at"].isoformat() if row.get("published_at") else None,
            }
            for row in mentions
        ],
    }
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def load_cached_media_mentions() -> dict:
    if not CACHE_PATH.exists():
        return {"source_url": "WardOS configured RSS media sources", "fetched_at": None, "source_count": 0, "mention_count": 0, "sources": [], "mentions": []}
    return json.loads(CACHE_PATH.read_text(encoding="utf-8"))


def upsert_media_mentions(db: "Session", payload: dict) -> dict:
    from app.models import AuditLog, MediaMention

    imported = 0
    skipped = 0
    for item in payload.get("mentions", []):
        url = item.get("url", "")
        if url and db.query(MediaMention).filter(MediaMention.url == url).first():
            skipped += 1
            continue
        published_at = datetime.fromisoformat(item["published_at"]) if item.get("published_at") else None
        db.add(
            MediaMention(
                source=item["source"],
                source_type=item["source_type"],
                headline=item["headline"],
                summary=item["summary"],
                url=url,
                sentiment=item["sentiment"],
                topic=item["topic"],
                geographic_tag=item["geographic_tag"],
                engagement_score=item["engagement_score"],
                published_at=published_at,
            )
        )
        imported += 1
    db.add(AuditLog(actor="wardos_scheduler", action="sync", entity_type="media_mentions", detail=f"Imported {imported}; skipped {skipped}"))
    db.commit()
    return {"imported": imported, "skipped": skipped, "mention_count": payload.get("mention_count", 0)}
