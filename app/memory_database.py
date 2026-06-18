from __future__ import annotations

import csv
import hashlib
import json
import os
from datetime import date, datetime, time
from pathlib import Path
from typing import Iterable

import requests
from sqlalchemy.orm import Session

from app.models import (
    BudgetWatchItem,
    Constituent,
    ConstituentCase,
    DevelopmentProject,
    DocumentRecord,
    Event,
    LegislationItem,
    MediaMention,
    OfficeAction,
    PublicSafetyIncident,
    SourceConnection,
    StaffUser,
    WardOSMemoryItem,
)


DEFAULT_MEMORY_SHEET_ID = "1X6RwweEwqRSXII27hlmn8Qed8gSQuahaY40EA32XFE4"
EXPORT_DIR = Path(os.getenv("WARDOS_DATA_DIR", "/app/data")) / "memory_database"

MEMORY_FIELDS = [
    "memory_key",
    "category",
    "source_table",
    "source_id",
    "title",
    "summary",
    "status",
    "priority",
    "owner",
    "event_date",
    "url",
    "tags",
    "payload_json",
    "sheet_name",
    "row_hash",
    "last_seen_at",
    "created_at",
    "updated_at",
]

SHEET_NAMES = {
    "constituents": "Constituents",
    "constituent_needs": "Constituent Needs",
    "events": "Events",
    "reports_documents": "Reports Documents",
    "legislation": "Legislation",
    "budget_watch": "Budget Watch",
    "development": "Development",
    "media_monitor": "Media Monitor",
    "public_safety": "Public Safety",
    "office_actions": "Office Actions",
    "sources": "Sources",
    "staff": "Staff",
}


def iso(value) -> str:
    return value.isoformat() if value else ""


def clean(value) -> str:
    return str(value or "").strip()


def stable_json(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def row_hash(payload: dict) -> str:
    return hashlib.sha256(stable_json(payload).encode("utf-8")).hexdigest()


def memory_key(category: str, source_table: str, source_id) -> str:
    return f"{category}:{source_table}:{source_id}"


def normalize_datetime(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    return value


def item(
    *,
    category: str,
    source_table: str,
    source_id,
    title: str,
    summary: str = "",
    status: str = "",
    priority: str = "",
    owner: str = "",
    event_date=None,
    url: str = "",
    tags: Iterable[str] = (),
    payload: dict | None = None,
) -> dict:
    payload = payload or {}
    key = memory_key(category, source_table, source_id)
    normalized_event_date = normalize_datetime(event_date)
    hash_payload = {
        "memory_key": key,
        "category": category,
        "source_table": source_table,
        "source_id": clean(source_id),
        "title": clean(title) or "Untitled",
        "summary": clean(summary),
        "status": clean(status),
        "priority": clean(priority),
        "owner": clean(owner),
        "event_date": iso(normalized_event_date),
        "url": clean(url),
        "tags": ",".join(sorted({clean(tag) for tag in tags if clean(tag)})),
        "payload_json": stable_json(payload),
        "sheet_name": SHEET_NAMES.get(category, category.replace("_", " ").title()),
    }
    source_payload = {**hash_payload, "event_date": normalized_event_date}
    source_payload["row_hash"] = row_hash(hash_payload)
    return source_payload


def collect_memory_items(db: Session) -> list[dict]:
    rows: list[dict] = []

    for row in db.query(Constituent).all():
        rows.append(item(
            category="constituents",
            source_table="constituents",
            source_id=row.id,
            title=row.full_name,
            summary=" ".join(part for part in [row.street_no, row.street, row.apt, row.city, row.state, row.zip_code] if part),
            status=row.voter_status,
            priority=row.subgroup,
            event_date=row.updated_at,
            tags=[row.ward, row.subgroup, row.voter_status],
            payload={
                "voter_id": row.voter_id,
                "mailin_request_date": iso(row.mailin_request_date),
                "mailin_sent_date": iso(row.mailin_sent_date),
                "mailin_received_date": iso(row.mailin_received_date),
                "days_to_return": row.days_to_return,
                "source_file": row.source_file,
                "notes": row.notes,
            },
        ))

    for row in db.query(ConstituentCase).all():
        rows.append(item(
            category="constituent_needs",
            source_table="constituent_cases",
            source_id=row.id,
            title=row.topic,
            summary=" · ".join(part for part in [row.constituent_name, row.address_line, row.notes] if part),
            status=row.status,
            priority=row.priority,
            event_date=row.created_at,
            tags=[row.topic, row.status, row.priority],
            payload={
                "constituent_name": row.constituent_name,
                "address_line": row.address_line,
                "phone": row.phone,
                "email": row.email,
                "latitude": row.latitude,
                "longitude": row.longitude,
            },
        ))

    for row in db.query(Event).all():
        rows.append(item(
            category="events",
            source_table="events",
            source_id=row.id,
            title=row.title,
            summary=row.notes,
            status=row.status,
            event_date=row.starts_at or row.created_at,
            url=row.source_url,
            tags=[row.event_type, row.location, row.status],
            payload={"location": row.location, "event_type": row.event_type, "source_id": row.source_id},
        ))

    for row in db.query(DocumentRecord).all():
        rows.append(item(
            category="reports_documents",
            source_table="document_records",
            source_id=row.id,
            title=row.title,
            summary=row.notes,
            status=row.status,
            event_date=row.created_at,
            tags=[row.folder, row.doc_type, row.status],
            payload={"folder": row.folder, "file_name": row.file_name, "doc_type": row.doc_type},
        ))

    for row in db.query(LegislationItem).all():
        rows.append(item(
            category="legislation",
            source_table="legislation_items",
            source_id=row.id,
            title=f"{row.bill_number} {row.title}".strip(),
            summary=row.notes,
            status=row.status,
            event_date=row.hearing_date or row.created_at,
            tags=[row.bill_number, row.status],
            payload={"bill_number": row.bill_number, "hearing_date": iso(row.hearing_date)},
        ))

    for row in db.query(BudgetWatchItem).all():
        rows.append(item(
            category="budget_watch",
            source_table="budget_watch_items",
            source_id=row.id,
            title=f"{row.department}: {row.line_item}",
            summary=row.concern,
            status=row.status,
            event_date=row.created_at,
            tags=[row.department, row.fiscal_year, row.status],
            payload={"department": row.department, "line_item": row.line_item, "fiscal_year": row.fiscal_year},
        ))

    for row in db.query(DevelopmentProject).all():
        rows.append(item(
            category="development",
            source_table="development_projects",
            source_id=row.id,
            title=row.name,
            summary=" · ".join(part for part in [row.address, row.notes] if part),
            status=row.status,
            event_date=row.created_at,
            url=row.source_url,
            tags=[row.board, row.project_type, row.status],
            payload={"address": row.address, "latitude": row.latitude, "longitude": row.longitude, "source_id": row.source_id},
        ))

    for row in db.query(MediaMention).all():
        rows.append(item(
            category="media_monitor",
            source_table="media_mentions",
            source_id=row.id,
            title=row.headline,
            summary=row.summary,
            status=row.sentiment,
            priority=row.topic,
            event_date=row.published_at or row.created_at,
            url=row.url,
            tags=[row.source, row.source_type, row.topic, row.geographic_tag],
            payload={"engagement_score": row.engagement_score, "latitude": row.latitude, "longitude": row.longitude},
        ))

    for row in db.query(PublicSafetyIncident).all():
        rows.append(item(
            category="public_safety",
            source_table="public_safety_incidents",
            source_id=row.id,
            title=row.title,
            summary=row.notes,
            status=row.status,
            priority=row.severity,
            event_date=row.occurred_at or row.created_at,
            url=row.source_url,
            tags=[row.category, row.incident_type, row.ward, row.severity],
            payload={"location": row.location, "source_file": row.source_file, "latitude": row.latitude, "longitude": row.longitude},
        ))

    for row in db.query(OfficeAction).all():
        rows.append(item(
            category="office_actions",
            source_table="office_actions",
            source_id=row.id,
            title=row.title,
            summary=row.notes,
            status=row.status,
            priority=row.priority,
            owner=row.owner,
            event_date=row.due_at or row.created_at,
            tags=[row.action_type, row.source_type, row.status],
            payload={"source_id": row.source_id},
        ))

    for row in db.query(SourceConnection).all():
        rows.append(item(
            category="sources",
            source_table="source_connections",
            source_id=row.id,
            title=row.name,
            summary=row.notes,
            status=row.status,
            event_date=row.last_sync_at or row.created_at,
            url=row.url,
            tags=[row.source_type, "enabled" if row.enabled else "disabled", row.status],
            payload={"enabled": row.enabled},
        ))

    for row in db.query(StaffUser).all():
        rows.append(item(
            category="staff",
            source_table="staff_users",
            source_id=row.id,
            title=row.full_name,
            summary=row.notes,
            status="active" if row.is_active else "inactive",
            priority=row.role,
            owner=row.email,
            event_date=row.created_at,
            tags=[row.role, row.title],
            payload={"email": row.email, "title": row.title, "is_active": row.is_active},
        ))

    return rows


def sync_memory_database(db: Session, actor: str = "wardos_memory_sync") -> dict:
    now = datetime.utcnow()
    source_rows = collect_memory_items(db)
    created = 0
    updated = 0
    unchanged = 0

    for source in source_rows:
        existing = db.query(WardOSMemoryItem).filter(WardOSMemoryItem.memory_key == source["memory_key"]).first()
        if existing:
            if existing.row_hash == source["row_hash"]:
                existing.last_seen_at = now
                unchanged += 1
                continue
            for key, value in source.items():
                if key in {"event_date"} and not value:
                    setattr(existing, key, None)
                else:
                    setattr(existing, key, value)
            existing.last_seen_at = now
            updated += 1
        else:
            row = WardOSMemoryItem(**{**source, "last_seen_at": now})
            db.add(row)
            created += 1

    db.commit()
    return {
        "status": "synced",
        "actor": actor,
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "total_seen": len(source_rows),
    }


def serialize_memory_item(row: WardOSMemoryItem) -> dict:
    return {
        field: iso(getattr(row, field)) if field in {"event_date", "last_seen_at", "created_at", "updated_at"} else getattr(row, field)
        for field in MEMORY_FIELDS
    }


def memory_summary(db: Session) -> dict:
    rows = db.query(WardOSMemoryItem).all()
    by_category: dict[str, int] = {}
    for row in rows:
        by_category[row.category] = by_category.get(row.category, 0) + 1
    return {
        "total": len(rows),
        "by_category": dict(sorted(by_category.items())),
        "sheet_id": memory_sheet_id(),
        "sheet_url": memory_sheet_url(),
        "categories": SHEET_NAMES,
    }


def export_memory_database(db: Session) -> dict:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    rows = db.query(WardOSMemoryItem).order_by(WardOSMemoryItem.category.asc(), WardOSMemoryItem.updated_at.desc()).all()
    serialized = [serialize_memory_item(row) for row in rows]

    all_path = EXPORT_DIR / "all_memory_items.csv"
    write_csv(all_path, serialized)

    files = {"all": str(all_path)}
    for category in SHEET_NAMES:
        category_rows = [row for row in serialized if row["category"] == category]
        category_path = EXPORT_DIR / f"{category}.csv"
        write_csv(category_path, category_rows)
        files[category] = str(category_path)

    manifest = {
        "generated_at": datetime.utcnow().isoformat(),
        "sheet_id": memory_sheet_id(),
        "sheet_url": memory_sheet_url(),
        "fields": MEMORY_FIELDS,
        "files": files,
        "summary": memory_summary(db),
    }
    manifest_path = EXPORT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=MEMORY_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in MEMORY_FIELDS})


def memory_sheet_id() -> str:
    return os.getenv("WARDOS_MEMORY_SHEET_ID", DEFAULT_MEMORY_SHEET_ID).strip()


def memory_sheet_url() -> str:
    return f"https://docs.google.com/spreadsheets/d/{memory_sheet_id()}/edit"


def google_sheet_status() -> dict:
    sheet_id = memory_sheet_id()
    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid=0"
    credentials_configured = bool(os.getenv("WARDOS_GOOGLE_SERVICE_ACCOUNT_JSON") or os.getenv("WARDOS_GOOGLE_SERVICE_ACCOUNT_FILE"))
    try:
        response = requests.get(export_url, timeout=8)
        readable = response.ok
        sample = response.text[:500]
        row_count = len([line for line in response.text.splitlines() if line.strip()]) if response.text else 0
        error = ""
    except requests.RequestException as exc:
        readable = False
        sample = ""
        row_count = 0
        error = str(exc)
    return {
        "sheet_id": sheet_id,
        "sheet_url": memory_sheet_url(),
        "csv_export_url": export_url,
        "readable": readable,
        "first_tab_rows": row_count,
        "first_tab_sample": sample,
        "write_credentials_configured": credentials_configured,
        "write_mode": "service_account_required" if not credentials_configured else "ready_for_service_account_writer",
        "error": error,
        "recommended_tabs": list(SHEET_NAMES.values()),
        "fields": MEMORY_FIELDS,
    }
