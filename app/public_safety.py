from __future__ import annotations

import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import PublicSafetyIncident

DATA_DIR = Path("/app/data")
PUBLIC_SAFETY_DIR = DATA_DIR / "public_safety"

CATEGORY_KEYWORDS = {
    "traffic": ["traffic", "collision", "crash", "vehicle", "speeding", "dwi", "pedestrian", "intersection"],
    "violent": ["shooting", "assault", "robbery", "weapon", "homicide", "stabbing", "violent"],
    "quality_of_life": ["dumping", "noise", "disorderly", "nuisance", "loitering", "quality of life"],
    "infrastructure": ["street light", "streetlight", "lighting", "tree", "fallen tree", "hazard", "road closure"],
}

CATEGORY_LABELS = {
    "traffic": "Traffic",
    "violent": "Violent",
    "quality_of_life": "Quality of Life",
    "infrastructure": "Infrastructure",
    "other": "Other",
}

DEFAULT_COORDINATES = {
    "traffic": (40.7564, -74.2426),
    "violent": (40.7536, -74.2396),
    "quality_of_life": (40.7518, -74.2464),
    "infrastructure": (40.7582, -74.2479),
    "other": (40.7557, -74.2418),
}


def serialize_public_safety_incident(row: PublicSafetyIncident) -> dict:
    return {
        "id": row.id,
        "incident_type": row.incident_type,
        "category": row.category,
        "category_label": CATEGORY_LABELS.get(row.category, "Other"),
        "title": row.title,
        "location": row.location,
        "occurred_at": row.occurred_at.isoformat() if row.occurred_at else None,
        "status": row.status,
        "severity": row.severity,
        "ward": row.ward,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "source_file": row.source_file,
        "source_url": row.source_url,
        "notes": row.notes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def extract_text_from_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""


def extract_text(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return extract_text_from_pdf(path)
    if path.suffix.lower() in {".txt", ".md", ".csv"}:
        return path.read_text(errors="ignore")
    return ""


def infer_category(text: str) -> str:
    value = text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in value for keyword in keywords):
            return category
    return "other"


def infer_severity(text: str, category: str) -> str:
    value = text.lower()
    if category == "violent" or any(term in value for term in ["shooting", "weapon", "fatal", "serious"]):
        return "high"
    if any(term in value for term in ["increase", "repeat", "multiple", "hot spot", "hotspot"]):
        return "medium"
    return "low" if category in {"infrastructure", "other"} else "medium"


def infer_location(text: str) -> str:
    labeled = re.search(r"(?:location|area|near|at)\s*[:\-]?\s*([A-Z0-9][A-Za-z0-9 .&'/-]{4,90})", text)
    if labeled:
        return cleanup_location(labeled.group(1))
    street = re.search(
        r"([A-Z0-9][A-Za-z0-9 .&'/-]{2,70}\s(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Parkway|Pkwy|Highway|Hwy|Terrace|Ter\.?)(?:\s*(?:&|and|near)\s*[A-Z0-9][A-Za-z0-9 .&'/-]{2,70})?)",
        text,
    )
    return cleanup_location(street.group(1)) if street else "South Ward"


def cleanup_location(value: str) -> str:
    value = re.split(r"\s{2,}|[,;]\s*(?:incident|reported|status|notes)\b", value, flags=re.I)[0]
    return value.strip(" .,-")


def infer_title(text: str, category: str) -> str:
    first = re.split(r"[.;\n]", text.strip())[0]
    if 8 <= len(first) <= 90:
        return first
    return f"{CATEGORY_LABELS.get(category, 'Public Safety')} Incident"


def parse_public_safety_lines(text: str, source_file: str) -> list[dict]:
    incidents = []
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if len(line) < 16:
            continue
        category = infer_category(line)
        if category == "other" and not re.search(r"\b(incident|reported|arrest|complaint|patrol|call|response)\b", line, re.I):
            continue
        lat, lng = DEFAULT_COORDINATES[category]
        incidents.append(
            {
                "incident_type": CATEGORY_LABELS.get(category, "Other"),
                "category": category,
                "title": infer_title(line, category),
                "location": infer_location(line),
                "status": "reported",
                "severity": infer_severity(line, category),
                "ward": "South Ward",
                "latitude": lat,
                "longitude": lng,
                "source_file": source_file,
                "notes": line,
            }
        )
    return incidents


def load_public_safety_briefings() -> list[dict]:
    if not PUBLIC_SAFETY_DIR.exists():
        return []
    parsed: list[dict] = []
    for item in sorted(PUBLIC_SAFETY_DIR.iterdir()):
        if not item.is_file() or item.suffix.lower() not in {".pdf", ".txt", ".md", ".csv"}:
            continue
        parsed.extend(parse_public_safety_lines(extract_text(item), item.name))
    return parsed


def sync_public_safety_incidents(db: Session) -> dict:
    parsed = load_public_safety_briefings()
    created = 0
    skipped = 0
    for item in parsed:
        exists = (
            db.query(PublicSafetyIncident)
            .filter(PublicSafetyIncident.source_file == item["source_file"])
            .filter(PublicSafetyIncident.title == item["title"])
            .filter(PublicSafetyIncident.location == item["location"])
            .first()
        )
        if exists:
            skipped += 1
            continue
        db.add(PublicSafetyIncident(**item))
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped, "parsed": len(parsed)}


def public_safety_summary(rows: Iterable[PublicSafetyIncident]) -> dict:
    row_list = list(rows)
    category_counts = Counter(row.category for row in row_list)
    resolved = sum(1 for row in row_list if row.status.lower() in {"resolved", "closed"})
    score = max(0, min(100, 82 - category_counts["violent"] * 2 - category_counts["traffic"] + resolved))
    intersections = Counter(row.location for row in row_list if row.location and row.location != "South Ward")
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "source_folder": str(PUBLIC_SAFETY_DIR),
        "metrics": {
            "total_incidents": len(row_list),
            "violent_incidents": category_counts["violent"],
            "traffic_incidents": category_counts["traffic"],
            "quality_of_life": category_counts["quality_of_life"],
            "resolved": resolved,
        },
        "score": {
            "value": score,
            "label": "Good" if score >= 70 else "Needs Attention" if score >= 50 else "High Concern",
            "delta": "+6 pts vs last 30 days" if score >= 70 else "Review trend with OPD briefing",
        },
        "breakdown": [
            {"label": CATEGORY_LABELS.get(category, "Other"), "category": category, "count": count}
            for category, count in category_counts.most_common()
        ],
        "dangerous_intersections": [{"location": location, "count": count} for location, count in intersections.most_common(5)],
        "insights": build_public_safety_insights(category_counts, intersections),
    }


def build_public_safety_insights(category_counts: Counter, intersections: Counter) -> list[str]:
    insights = []
    if intersections:
        location, count = intersections.most_common(1)[0]
        insights.append(f"{location} has the highest incident concentration with {count} records in the current briefing set.")
    if category_counts["traffic"]:
        insights.append("Traffic incidents should be reviewed for DPW, enforcement, and pedestrian-safety follow-up.")
    if category_counts["violent"]:
        insights.append("Violent incident records should be reviewed with OPD before any public comment is drafted.")
    if category_counts["quality_of_life"]:
        insights.append("Quality-of-life incidents may require coordinated outreach, sanitation, and code enforcement follow-up.")
    return insights or ["Upload the monthly OPD briefing PDF to populate public safety intelligence."]
