from __future__ import annotations

import json
import logging
import time as time_module
import requests
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, time
from pathlib import Path
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.briefing import generate_daily_briefing, read_folder
from app.case_log import parse_case_datetime, read_case_log, serialize_case, write_case_log
from app.city_bulletins import fetch_city_bulletins, load_cached_city_bulletins, upsert_city_bulletins
from app.city_calendar import fetch_city_calendar, load_cached_city_calendar, upsert_city_calendar_events
from app.council_meetings import (
    COUNCIL_MEETINGS_URL,
    fetch_council_meetings,
    load_cached_council_meetings,
    upsert_council_meetings,
)
from app.database import SessionLocal, get_db, init_db
from app.development_watch import fetch_development_watch, load_cached_development_watch, upsert_development_watch
from app.github_sources import SOURCES, aggregate_office_data, normalize_budget, normalize_metrics
from app.media_config import flatten_source_entries, load_media_config
from app.media_ingest import fetch_media_mentions, load_cached_media_mentions, upsert_media_mentions
from app.memory_database import (
    EXPORT_DIR,
    export_memory_database,
    google_sheet_status,
    memory_summary,
    serialize_memory_item,
    sync_memory_database,
)
from app.google_sheet_sync import google_sheet_writer_status, sync_memory_to_google_sheet
from app.models import (
    AuditLog,
    BudgetWatchItem,
    CityBulletin,
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
from app.public_safety import public_safety_summary, serialize_public_safety_incident, sync_public_safety_incidents
from app.security import (
    AuthContext,
    log_request_summary,
    enforce_rate_limit,
    require_admin_access,
    require_staff_access,
    security_headers,
)
from app.settings import get_settings
from app.staff_config import load_staff_config
from app.weather import get_orange_weather

settings = get_settings()
logging.basicConfig(level=getattr(logging, settings.security_log_level.upper(), logging.INFO))

app = FastAPI(title="WardOS Office Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-WardOS-API-Key", "X-WardOS-Actor", "X-WardOS-Role", "X-Requested-With"],
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CaseCreate(StrictModel):
    constituent_name: str = Field(min_length=2, max_length=255)
    address_line: str = Field(default="", max_length=500)
    phone: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=255)
    topic: str = Field(min_length=2, max_length=255)
    status: str = Field(default="open", max_length=80)
    priority: str = Field(default="normal", max_length=80)
    notes: str = Field(default="", max_length=5000)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class LegislationCreate(StrictModel):
    bill_number: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=2, max_length=500)
    status: str = Field(default="tracking", max_length=120)
    notes: str = Field(default="", max_length=5000)


class BudgetWatchCreate(StrictModel):
    department: str = Field(min_length=2, max_length=255)
    line_item: str = Field(min_length=2, max_length=255)
    fiscal_year: str = Field(min_length=2, max_length=20)
    concern: str = Field(default="", max_length=5000)
    status: str = Field(default="watching", max_length=120)


class EventCreate(StrictModel):
    title: str = Field(min_length=2, max_length=255)
    starts_at: Optional[datetime] = None
    location: str = Field(default="", max_length=255)
    event_type: str = Field(default="meeting", max_length=120)
    status: str = Field(default="scheduled", max_length=120)
    notes: str = Field(default="", max_length=5000)
    source_url: str = Field(default="", max_length=2000)
    source_id: str = Field(default="", max_length=255)


class DevelopmentProjectCreate(StrictModel):
    name: str = Field(min_length=2, max_length=255)
    address: str = Field(default="", max_length=255)
    project_type: str = Field(default="", max_length=120)
    status: str = Field(default="tracking", max_length=120)
    board: str = Field(default="", max_length=120)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: str = Field(default="", max_length=5000)
    source_url: str = Field(default="", max_length=2000)
    source_id: str = Field(default="", max_length=255)


class MediaMentionCreate(StrictModel):
    source: str = Field(min_length=2, max_length=255)
    source_type: str = Field(default="news", max_length=120)
    headline: str = Field(min_length=2, max_length=500)
    summary: str = Field(default="", max_length=5000)
    url: str = Field(default="", max_length=2000)
    sentiment: str = Field(default="neutral", max_length=80)
    topic: str = Field(default="", max_length=120)
    geographic_tag: str = Field(default="", max_length=120)
    engagement_score: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    published_at: Optional[datetime] = None


class PublicSafetyIncidentCreate(StrictModel):
    incident_type: str = Field(default="incident", max_length=120)
    category: str = Field(default="other", max_length=120)
    title: str = Field(min_length=2, max_length=255)
    location: str = Field(default="", max_length=255)
    occurred_at: Optional[datetime] = None
    status: str = Field(default="reported", max_length=120)
    severity: str = Field(default="medium", max_length=80)
    ward: str = Field(default="South Ward", max_length=120)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source_file: str = Field(default="", max_length=500)
    source_url: str = Field(default="", max_length=2000)
    notes: str = Field(default="", max_length=5000)


class OfficeActionCreate(StrictModel):
    title: str = Field(min_length=2, max_length=255)
    action_type: str = Field(default="follow_up", max_length=120)
    status: str = Field(default="draft", max_length=120)
    priority: str = Field(default="normal", max_length=80)
    owner: str = Field(default="", max_length=255)
    due_at: Optional[datetime] = None
    source_type: str = Field(default="", max_length=120)
    source_id: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=5000)


class SourceConnectionCreate(StrictModel):
    name: str = Field(min_length=2, max_length=255)
    source_type: str = Field(min_length=2, max_length=120)
    url: str = Field(default="", max_length=2000)
    enabled: bool = True
    status: str = Field(default="not_configured", max_length=120)
    notes: str = Field(default="", max_length=5000)


class StaffUserCreate(StrictModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=5, max_length=255)
    role: str = Field(min_length=2, max_length=120)
    title: str = Field(default="", max_length=255)
    is_active: bool = True
    notes: str = Field(default="", max_length=5000)


DATA_DIR = Path("/app/data")
INTAKE_FOLDERS = [
    "inbox",
    "agendas",
    "minutes",
    "constituent_cases",
    "legislation",
    "ward_report",
    "budget",
]


@app.middleware("http")
async def wardos_security_middleware(request: Request, call_next):
    request.state.request_id = request.headers.get("x-request-id", "") or uuid4().hex
    started_at = time_module.time()
    enforce_rate_limit(request)
    try:
        response = await call_next(request)
    except HTTPException:
        raise
    except Exception:
        logging.getLogger("wardos.api").exception("Unhandled WardOS API error")
        response = Response(
            content=json.dumps({"detail": "WardOS encountered an internal error", "request_id": request.state.request_id}),
            media_type="application/json",
            status_code=500,
        )
    if settings.enable_security_headers:
        security_headers(request, response)
    response.headers.setdefault("Cache-Control", "no-store")
    if hasattr(request.state, "rate_limit_remaining"):
        response.headers.setdefault("X-RateLimit-Remaining", str(request.state.rate_limit_remaining))
    if hasattr(request.state, "rate_limit_retry_after"):
        response.headers.setdefault("X-RateLimit-Reset", str(request.state.rate_limit_retry_after))
    log_request_summary(request, response, started_at)
    return response


def serialize_dt(value):
    return value.isoformat() if value else None


def json_dumps(value):
    return json.dumps(value, sort_keys=True)


def audit(db: Session, action: str, entity_type: str, entity_id: str = "", detail: str = "", actor: str = "local_staff") -> None:
    db.add(AuditLog(actor=actor, action=action, entity_type=entity_type, entity_id=str(entity_id), detail=detail))


def case_exists(db: Session, row: dict) -> bool:
    created_at = parse_case_datetime(str(row.get("created_at") or ""))
    query = db.query(ConstituentCase).filter(
        ConstituentCase.constituent_name == str(row.get("constituent_name") or ""),
        ConstituentCase.topic == str(row.get("topic") or ""),
        ConstituentCase.phone == str(row.get("phone") or ""),
        ConstituentCase.email == str(row.get("email") or ""),
    )
    if created_at:
        query = query.filter(ConstituentCase.created_at == created_at)
    return query.first() is not None


def restore_cases_from_log(db: Session) -> int:
    restored = 0
    for row in read_case_log():
        if not row.get("constituent_name") or not row.get("topic") or case_exists(db, row):
            continue
        case = ConstituentCase(
            constituent_name=str(row.get("constituent_name") or ""),
            address_line=str(row.get("address_line") or ""),
            phone=str(row.get("phone") or ""),
            email=str(row.get("email") or ""),
            topic=str(row.get("topic") or ""),
            status=str(row.get("status") or "open"),
            priority=str(row.get("priority") or "normal"),
            notes=str(row.get("notes") or ""),
            latitude=float(row["latitude"]) if row.get("latitude") else None,
            longitude=float(row["longitude"]) if row.get("longitude") else None,
            created_at=parse_case_datetime(str(row.get("created_at") or "")) or datetime.utcnow(),
        )
        db.add(case)
        restored += 1
    if restored:
        db.commit()
    return restored


@app.on_event("startup")
def startup() -> None:
    init_db()
    with SessionLocal() as db:
        restore_cases_from_log(db)


@app.get("/")
def home():
    return {"status": "WardOS Office Server running"}


@app.get("/health")
def health():
    settings = get_settings()
    return {"ok": True, "timezone": "America/New_York", "sample_mode": settings.sample_mode}


@app.get("/system/status")
def system_status(_auth: AuthContext = Depends(require_admin_access), db: Session = Depends(get_db)):
    return {
        "ok": True,
        "timezone": "America/New_York",
        "sample_mode": settings.sample_mode,
        "database": {
            "connected": True,
            "constituents": db.query(Constituent).count(),
            "cases": db.query(ConstituentCase).count(),
            "legislation": db.query(LegislationItem).count(),
            "budget_watch": db.query(BudgetWatchItem).count(),
            "events": db.query(Event).count(),
            "development_projects": db.query(DevelopmentProject).count(),
            "media_mentions": db.query(MediaMention).count(),
            "public_safety_incidents": db.query(PublicSafetyIncident).count(),
            "city_bulletins": db.query(CityBulletin).count(),
            "documents": db.query(DocumentRecord).count(),
            "actions": db.query(OfficeAction).count(),
            "staff_users": db.query(StaffUser).count(),
            "memory_items": db.query(WardOSMemoryItem).count(),
        },
        "safety": {
            "local_first": True,
            "auto_send_email": False,
            "auto_publish": False,
            "staff_review_required": True,
            "authentication": "roles_scaffolded",
        },
        "integrations": {
            "github": "configured" if settings.github_token else "public_read_only",
            "ollama": settings.ollama_base_url,
            "media_sources": db.query(SourceConnection).filter(SourceConnection.enabled == True).count(),
        },
    }


@app.get("/weather/today")
def weather_today():
    return get_orange_weather()


@app.get("/briefing/daily")
def daily_briefing():
    return generate_daily_briefing()


@app.get("/documents")
def documents(_auth: AuthContext = Depends(require_staff_access)):
    return {folder: read_folder(folder) for folder in INTAKE_FOLDERS}


@app.get("/memory/database")
def wardos_memory_database(limit: int = 50, _auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    rows = (
        db.query(WardOSMemoryItem)
        .order_by(WardOSMemoryItem.updated_at.desc())
        .limit(min(max(limit, 1), 500))
        .all()
    )
    return {"summary": memory_summary(db), "recent": [serialize_memory_item(row) for row in rows]}


@app.post("/memory/database/sync")
def sync_wardos_memory_database(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    result = sync_memory_database(db)
    audit(db, "sync", "wardos_memory_items", detail=json_dumps(result), actor=auth.actor)
    db.commit()
    return result


@app.post("/memory/database/export")
def export_wardos_memory_database(auth: AuthContext = Depends(require_admin_access), db: Session = Depends(get_db)):
    sync_result = sync_memory_database(db)
    manifest = export_memory_database(db)
    audit(db, "export", "wardos_memory_items", detail=json_dumps({"sync": sync_result, "manifest": manifest["files"]}), actor=auth.actor)
    db.commit()
    return {"sync": sync_result, "manifest": manifest}


@app.get("/memory/database/export/{file_name}")
def download_wardos_memory_database_export(file_name: str, _auth: AuthContext = Depends(require_admin_access)):
    allowed = {"manifest.json", "all_memory_items.csv"}
    allowed.update({f"{name}.csv" for name in [
        "constituents",
        "constituent_needs",
        "events",
        "reports_documents",
        "legislation",
        "budget_watch",
        "development",
        "media_monitor",
        "public_safety",
        "office_actions",
        "sources",
        "staff",
    ]})
    if file_name not in allowed:
        return {"error": "Unknown export file"}
    path = EXPORT_DIR / file_name
    if not path.exists():
        return {"error": "Export has not been generated yet. Run POST /memory/database/export first."}
    media_type = "application/json" if file_name.endswith(".json") else "text/csv"
    return FileResponse(path, media_type=media_type, filename=file_name)


@app.get("/memory/database/google-sheet")
def wardos_memory_google_sheet_status(_auth: AuthContext = Depends(require_admin_access)):
    return {**google_sheet_status(), "writer": google_sheet_writer_status()}


@app.post("/memory/database/google-sheet/sync")
def sync_wardos_memory_google_sheet(auth: AuthContext = Depends(require_admin_access), db: Session = Depends(get_db)):
    sync_result = sync_memory_database(db)
    sheet_result = sync_memory_to_google_sheet(db, sync_result=sync_result)
    audit(
        db,
        "sync_google_sheet",
        "wardos_memory_items",
        detail=json_dumps({"sync": sync_result, "sheet": sheet_result}),
        actor=auth.actor,
    )
    db.commit()
    return {"database": sync_result, "google_sheet": sheet_result}


@app.post("/documents/index")
def index_documents(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    created = 0
    for folder in INTAKE_FOLDERS:
        path = DATA_DIR / folder
        if not path.exists():
            continue
        for item in path.iterdir():
            if not item.is_file():
                continue
            exists = (
                db.query(DocumentRecord)
                .filter(DocumentRecord.folder == folder)
                .filter(DocumentRecord.file_name == item.name)
                .first()
            )
            if exists:
                continue
            db.add(DocumentRecord(title=item.stem, folder=folder, file_name=item.name, doc_type=folder))
            created += 1
    audit(db, "index", "documents", detail=f"Indexed {created} new documents", actor=auth.actor)
    db.commit()
    return {"created": created, "status": "indexed"}


@app.get("/document-records")
def document_records(_auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    rows = db.query(DocumentRecord).order_by(DocumentRecord.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "folder": row.folder,
            "file_name": row.file_name,
            "doc_type": row.doc_type,
            "status": row.status,
            "notes": row.notes,
            "created_at": serialize_dt(row.created_at),
        }
        for row in rows
    ]


@app.get("/dashboard/overview")
def dashboard_overview(db: Session = Depends(get_db)):
    settings = get_settings()
    restore_cases_from_log(db)
    constituent_count = db.query(Constituent).count()
    mailin_count = db.query(Constituent).filter(Constituent.subgroup == "May 2026 Mail-In Voters").count()
    open_cases = db.query(ConstituentCase).filter(ConstituentCase.status != "closed").count()
    legislation_count = db.query(LegislationItem).count()
    development_count = db.query(DevelopmentProject).count()
    media_count = db.query(MediaMention).count()
    today_start = datetime.combine(datetime.now().date(), time(0, 0))
    upcoming_events = (
        db.query(Event)
        .filter((Event.starts_at == None) | (Event.starts_at >= today_start))
        .order_by(Event.starts_at.asc().nullslast(), Event.created_at.desc())
        .limit(5)
        .all()
    )
    if not upcoming_events:
        upcoming_events = db.query(Event).order_by(Event.starts_at.desc().nullslast(), Event.created_at.desc()).limit(5).all()
    top_cases = db.query(ConstituentCase).order_by(ConstituentCase.created_at.desc()).limit(5).all()
    projects = db.query(DevelopmentProject).order_by(DevelopmentProject.created_at.desc()).limit(5).all()
    actions = db.query(OfficeAction).filter(OfficeAction.status != "closed").order_by(OfficeAction.created_at.desc()).limit(8).all()
    return {
        "sample_mode": settings.sample_mode,
        "metrics": {
            "open_requests": open_cases,
            "constituents": constituent_count,
            "mailin_voters": mailin_count,
            "council_meetings": db.query(Event).filter(Event.event_type == "meeting").count(),
            "pending_legislation": legislation_count,
            "development_projects": development_count,
            "media_mentions": media_count,
        },
        "priority_issues": [
            {
                "id": row.id,
                "title": row.topic,
                "meta": row.notes,
                "status": row.status,
                "priority": row.priority,
                "created_at": serialize_dt(row.created_at),
            }
            for row in top_cases
        ],
        "meetings": [
            {
                "id": row.id,
                "title": row.title,
                "starts_at": serialize_dt(row.starts_at),
                "location": row.location,
                "status": row.status,
                "event_type": row.event_type,
            }
            for row in upcoming_events
        ],
        "developments": [
            {
                "id": row.id,
                "name": row.name,
                "address": row.address,
                "project_type": row.project_type,
                "status": row.status,
                "board": row.board,
                "latitude": row.latitude,
                "longitude": row.longitude,
                "source_url": row.source_url,
                "source_id": row.source_id,
            }
            for row in projects
        ],
        "actions": [
            {
                "id": row.id,
                "title": row.title,
                "status": row.status,
                "priority": row.priority,
                "owner": row.owner,
                "source_type": row.source_type,
                "source_id": row.source_id,
            }
            for row in actions
        ],
    }


def serialize_constituent(row: Constituent):
    return {
        "id": row.id,
        "voter_id": row.voter_id,
        "first_name": row.first_name,
        "last_name": row.last_name,
        "full_name": row.full_name,
        "street_no": row.street_no,
        "street": row.street,
        "apt": row.apt,
        "city": row.city,
        "state": row.state,
        "zip": row.zip_code,
        "ward": row.ward,
        "subgroup": row.subgroup,
        "voter_status": row.voter_status,
        "mailin_request_date": row.mailin_request_date.isoformat() if row.mailin_request_date else None,
        "mailin_sent_date": row.mailin_sent_date.isoformat() if row.mailin_sent_date else None,
        "mailin_received_date": row.mailin_received_date.isoformat() if row.mailin_received_date else None,
        "days_to_return": row.days_to_return,
        "source_file": row.source_file,
        "notes": row.notes,
        "created_at": serialize_dt(row.created_at),
        "updated_at": serialize_dt(row.updated_at),
    }


def normalize_lookup(value: str) -> str:
    return " ".join(str(value or "").lower().replace(",", " ").split())


def constituent_lookup_address(row: Constituent) -> str:
    return normalize_lookup(" ".join(part for part in [
        row.street_no,
        row.street,
        row.apt,
        row.city,
        row.state,
        row.zip_code,
    ] if part))


def find_matching_constituent(db: Session, case: ConstituentCase):
    name = normalize_lookup(case.constituent_name)
    address = normalize_lookup(case.address_line)
    if name:
        match = db.query(Constituent).filter(Constituent.full_name.ilike(case.constituent_name.strip())).first()
        if match:
            return match
    if address:
        candidates = db.query(Constituent).filter(Constituent.street.ilike(f"%{case.address_line.split()[1] if len(case.address_line.split()) > 1 else case.address_line}%")).limit(250).all()
        for candidate in candidates:
            if address == constituent_lookup_address(candidate) or address in constituent_lookup_address(candidate):
                return candidate
    return None


def serialize_case_with_constituent(row: ConstituentCase, db: Session):
    payload = serialize_case(row)
    match = find_matching_constituent(db, row)
    if match:
        payload["matched_constituent_id"] = match.id
        payload["matched_constituent_voter_id"] = match.voter_id
        payload["matched_constituent_ward"] = match.ward
        payload["outside_local_ward"] = (match.ward or "").lower() != "south"
    else:
        payload["matched_constituent_id"] = None
        payload["matched_constituent_voter_id"] = None
        payload["matched_constituent_ward"] = ""
        payload["outside_local_ward"] = False
    return payload


@app.get("/constituents")
def constituents(subgroup: str = "", ward: str = "", q: str = "", limit: int = 250, _auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    query = db.query(Constituent).order_by(Constituent.last_name.asc(), Constituent.first_name.asc())
    if subgroup:
        query = query.filter(Constituent.subgroup == subgroup)
    if ward:
        query = query.filter(Constituent.ward.ilike(ward))
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(
            Constituent.full_name.ilike(term),
            Constituent.first_name.ilike(term),
            Constituent.last_name.ilike(term),
            Constituent.street_no.ilike(term),
            Constituent.street.ilike(term),
            Constituent.apt.ilike(term),
            Constituent.city.ilike(term),
            Constituent.zip_code.ilike(term),
            Constituent.ward.ilike(term),
            Constituent.subgroup.ilike(term),
            Constituent.voter_status.ilike(term),
            Constituent.voter_id.ilike(term),
            Constituent.notes.ilike(term),
        ))
    rows = query.limit(min(max(limit, 1), 2000)).all()
    return [serialize_constituent(row) for row in rows]


@app.get("/constituents/summary")
def constituents_summary(_auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    rows = db.query(Constituent).all()
    by_status: dict[str, int] = {}
    by_subgroup: dict[str, int] = {}
    by_ward: dict[str, int] = {}
    received_count = 0
    outstanding_count = 0
    total_return_days = 0
    returned_with_days = 0
    for row in rows:
        by_status[row.voter_status or "Unknown"] = by_status.get(row.voter_status or "Unknown", 0) + 1
        by_subgroup[row.subgroup or "Unassigned"] = by_subgroup.get(row.subgroup or "Unassigned", 0) + 1
        by_ward[row.ward or "Unknown"] = by_ward.get(row.ward or "Unknown", 0) + 1
        if (row.voter_status or "").lower() == "received":
            received_count += 1
        if (row.voter_status or "").lower() == "outstanding":
            outstanding_count += 1
        if row.days_to_return is not None:
            total_return_days += row.days_to_return
            returned_with_days += 1

    return {
        "total": len(rows),
        "by_status": by_status,
        "by_subgroup": by_subgroup,
        "by_ward": by_ward,
        "mailin_may_2026": by_subgroup.get("May 2026 Mail-In Voters", 0),
        "received": received_count,
        "outstanding": outstanding_count,
        "average_days_to_return": round(total_return_days / returned_with_days, 1) if returned_with_days else None,
    }


@app.get("/cases")
def constituent_cases(_auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    restore_cases_from_log(db)
    rows = db.query(ConstituentCase).order_by(ConstituentCase.created_at.desc()).all()
    write_case_log(rows)
    return [serialize_case_with_constituent(row, db) for row in rows]


@app.post("/cases")
def create_constituent_case(payload: CaseCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = ConstituentCase(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "constituent_case", row.id, row.topic, actor=auth.actor)
    db.commit()
    db.refresh(row)
    write_case_log(db.query(ConstituentCase).order_by(ConstituentCase.created_at.desc()).all())
    return {**serialize_case_with_constituent(row, db), "status": row.status, "save_status": "created", "persistent": True}


@app.get("/cases/export.csv")
def export_constituent_cases(_auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    restore_cases_from_log(db)
    rows = db.query(ConstituentCase).order_by(ConstituentCase.created_at.desc()).all()
    path = write_case_log(rows)
    return FileResponse(path, media_type="text/csv", filename="wardos_constituent_cases.csv")


@app.get("/legislation")
def legislation(db: Session = Depends(get_db)):
    rows = db.query(LegislationItem).order_by(LegislationItem.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "bill_number": row.bill_number,
            "title": row.title,
            "status": row.status,
            "hearing_date": row.hearing_date.isoformat() if row.hearing_date else None,
            "notes": row.notes,
            "source_url": row.source_url,
            "source_id": row.source_id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@app.post("/legislation")
def create_legislation_item(payload: LegislationCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = LegislationItem(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "legislation_item", row.id, row.bill_number, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": "created"}


@app.get("/budget-watch")
def budget_watch(db: Session = Depends(get_db)):
    rows = db.query(BudgetWatchItem).order_by(BudgetWatchItem.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "department": row.department,
            "line_item": row.line_item,
            "fiscal_year": row.fiscal_year,
            "concern": row.concern,
            "status": row.status,
        }
        for row in rows
    ]


@app.get("/integrations/github/sources")
def github_sources():
    return {"sources": SOURCES, "mode": "read-only"}


@app.get("/integrations/github/budget")
def github_budget():
    return normalize_budget()


@app.get("/integrations/github/progress")
def github_progress():
    return normalize_metrics("progress")


@app.get("/integrations/github/legislation")
def github_legislation():
    return normalize_metrics("legislation")


@app.get("/integrations/github/office")
def github_office():
    return aggregate_office_data()


@app.post("/budget-watch")
def create_budget_watch_item(payload: BudgetWatchCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = BudgetWatchItem(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "budget_watch_item", row.id, row.line_item, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": "created"}


@app.get("/events")
def events(db: Session = Depends(get_db)):
    rows = db.query(Event).order_by(Event.starts_at.asc().nullslast(), Event.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "starts_at": serialize_dt(row.starts_at),
            "location": row.location,
            "event_type": row.event_type,
            "status": row.status,
            "notes": row.notes,
            "source_url": row.source_url,
            "source_id": row.source_id,
        }
        for row in rows
    ]


@app.post("/events")
def create_event(payload: EventCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = Event(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "event", row.id, row.title, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": "created"}


@app.get("/council-meetings")
def council_meetings():
    return load_cached_council_meetings()


@app.post("/council-meetings/sync")
def sync_council_meetings(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    payload = fetch_council_meetings(COUNCIL_MEETINGS_URL)
    result = upsert_council_meetings(db, payload)
    audit(db, "sync", "council_meetings", detail=json_dumps(result), actor=auth.actor)
    db.commit()
    return {"status": "synced", **result, "source_url": COUNCIL_MEETINGS_URL}


@app.get("/city-calendar")
def city_calendar():
    return load_cached_city_calendar()


@app.post("/city-calendar/sync")
def sync_city_calendar(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    payload = fetch_city_calendar()
    result = upsert_city_calendar_events(db, payload)
    audit(db, "sync", "city_calendar", detail=json_dumps(result), actor=auth.actor)
    db.commit()
    return {"status": "synced", **result, "source_url": payload["source_url"]}


@app.get("/city-bulletins")
def city_bulletins():
    return load_cached_city_bulletins()


@app.post("/city-bulletins/sync")
def sync_city_bulletins(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    payload = fetch_city_bulletins()
    result = upsert_city_bulletins(db, payload)
    audit(db, "sync", "city_bulletins", detail=json_dumps(result), actor=auth.actor)
    db.commit()
    return {"status": "synced", **result, "source_url": payload["source_url"]}


@app.get("/development-watch")
def development_watch():
    return load_cached_development_watch()


@app.post("/development-watch/sync")
def sync_development_watch(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    payload = fetch_development_watch()
    result = upsert_development_watch(db, payload)
    audit(db, "sync", "development_watch", detail=json_dumps(result), actor=auth.actor)
    db.commit()
    return {"status": "synced", **result, "source_url": payload["source_url"]}


@app.get("/development-projects")
def development_projects(db: Session = Depends(get_db)):
    rows = db.query(DevelopmentProject).order_by(DevelopmentProject.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "address": row.address,
            "project_type": row.project_type,
            "status": row.status,
            "board": row.board,
            "latitude": row.latitude,
            "longitude": row.longitude,
            "notes": row.notes,
            "source_url": row.source_url,
            "source_id": row.source_id,
        }
        for row in rows
    ]


@app.post("/development-projects")
def create_development_project(payload: DevelopmentProjectCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = DevelopmentProject(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "development_project", row.id, row.name, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": "created"}


@app.get("/office-actions")
def office_actions(db: Session = Depends(get_db)):
    rows = db.query(OfficeAction).order_by(OfficeAction.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "action_type": row.action_type,
            "status": row.status,
            "priority": row.priority,
            "owner": row.owner,
            "due_at": serialize_dt(row.due_at),
            "source_type": row.source_type,
            "source_id": row.source_id,
            "notes": row.notes,
        }
        for row in rows
    ]


@app.post("/office-actions")
def create_office_action(payload: OfficeActionCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = OfficeAction(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "office_action", row.id, row.title, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": "created"}


@app.get("/media-monitor")
def media_monitor(db: Session = Depends(get_db)):
    rows = db.query(MediaMention).order_by(MediaMention.published_at.desc().nullslast(), MediaMention.created_at.desc()).limit(100).all()
    topics: dict[str, int] = {}
    for row in rows:
        topics[row.topic or "Uncategorized"] = topics.get(row.topic or "Uncategorized", 0) + 1
    return {
        "mentions": len(rows),
        "sentiment": "staff_review",
        "topics": [{"topic": topic, "count": count} for topic, count in sorted(topics.items(), key=lambda item: item[1], reverse=True)],
        "stories": [
            {
                "id": row.id,
                "source": row.source,
                "source_type": row.source_type,
                "headline": row.headline,
                "summary": row.summary,
                "url": row.url,
                "sentiment": row.sentiment,
                "topic": row.topic,
                "geographic_tag": row.geographic_tag,
                "engagement_score": row.engagement_score,
                "published_at": serialize_dt(row.published_at),
            }
            for row in rows
        ],
        "alerts": [],
        "actions": [],
    }


@app.get("/media-monitor/config")
def media_monitor_config():
    return load_media_config()


@app.post("/media-monitor/import-sources")
def import_media_sources(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    config = load_media_config()
    imported = 0
    skipped = 0
    for entry in flatten_source_entries(config):
        exists = (
            db.query(SourceConnection)
            .filter(SourceConnection.name == entry["name"])
            .filter(SourceConnection.source_type == entry["source_type"])
            .filter(SourceConnection.url == entry["url"])
            .first()
        )
        if exists:
            skipped += 1
            continue

        auth_required = entry["authentication_required"]
        has_url = bool(entry["url"])
        manual_source = entry["source"] == "agenda_minutes" or not has_url
        enabled = has_url and not auth_required
        if auth_required:
            status = "needs_credentials"
        elif manual_source:
            status = "manual_intake"
        else:
            status = "configured"

        notes = {
            "priority": entry["priority"],
            "category": entry["category"],
            "section": entry["section"],
            "source": entry["source"],
            "authentication_required": auth_required,
        }
        row = SourceConnection(
            name=entry["name"],
            source_type=entry["source_type"],
            url=entry["url"],
            enabled=enabled,
            status=status,
            notes=json_dumps(notes),
        )
        db.add(row)
        imported += 1
    audit(db, "import", "media_sources", detail=f"Imported {imported}; skipped {skipped}", actor=auth.actor)
    db.commit()
    return {"imported": imported, "skipped": skipped, "status": "complete"}


@app.get("/media-monitor/latest-rss")
def latest_media_rss():
    return load_cached_media_mentions()


@app.post("/media-monitor/sync")
def sync_media_monitor(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    payload = fetch_media_mentions()
    result = upsert_media_mentions(db, payload)
    audit(db, "sync", "media_monitor", detail=json_dumps(result), actor=auth.actor)
    db.commit()
    return {"status": "synced", **result, "source_url": payload["source_url"]}


@app.get("/media-mentions")
def media_mentions(db: Session = Depends(get_db)):
    rows = db.query(MediaMention).order_by(MediaMention.published_at.desc().nullslast(), MediaMention.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "source": row.source,
            "source_type": row.source_type,
            "headline": row.headline,
            "summary": row.summary,
            "url": row.url,
            "sentiment": row.sentiment,
            "topic": row.topic,
            "geographic_tag": row.geographic_tag,
            "engagement_score": row.engagement_score,
            "latitude": row.latitude,
            "longitude": row.longitude,
            "published_at": serialize_dt(row.published_at),
        }
        for row in rows
    ]


@app.post("/media-mentions")
def create_media_mention(payload: MediaMentionCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = MediaMention(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "media_mention", row.id, row.headline, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": "created"}


@app.get("/public-safety")
def public_safety_dashboard(db: Session = Depends(get_db)):
    rows = db.query(PublicSafetyIncident).order_by(PublicSafetyIncident.occurred_at.desc().nullslast(), PublicSafetyIncident.created_at.desc()).all()
    summary = public_safety_summary(rows)
    summary["incidents"] = [serialize_public_safety_incident(row) for row in rows]
    return summary


@app.post("/public-safety/incidents")
def create_public_safety_incident(payload: PublicSafetyIncidentCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = PublicSafetyIncident(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "public_safety_incident", row.id, row.title, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": "created"}


@app.post("/public-safety/sync")
def sync_public_safety(auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    result = sync_public_safety_incidents(db)
    audit(db, "sync", "public_safety", detail=json_dumps(result), actor=auth.actor)
    db.commit()
    return {"status": "synced", **result}


@app.get("/source-connections")
def source_connections(db: Session = Depends(get_db)):
    rows = db.query(SourceConnection).order_by(SourceConnection.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "source_type": row.source_type,
            "url": row.url,
            "enabled": row.enabled,
            "last_sync_at": serialize_dt(row.last_sync_at),
            "status": row.status,
            "notes": row.notes,
        }
        for row in rows
    ]


@app.post("/source-connections")
def create_source_connection(payload: SourceConnectionCreate, auth: AuthContext = Depends(require_staff_access), db: Session = Depends(get_db)):
    row = SourceConnection(**payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, "create", "source_connection", row.id, row.name, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": "created"}


def serialize_staff_user(row: StaffUser) -> dict:
    return {
        "id": row.id,
        "full_name": row.full_name,
        "email": row.email,
        "role": row.role,
        "title": row.title,
        "is_active": row.is_active,
        "notes": row.notes,
        "created_at": serialize_dt(row.created_at),
    }


@app.get("/staff/config")
def staff_config():
    return load_staff_config()


@app.get("/staff/roles")
def staff_roles():
    return load_staff_config().get("roles", {})


@app.get("/staff/users")
def staff_users(_auth: AuthContext = Depends(require_admin_access), db: Session = Depends(get_db)):
    rows = db.query(StaffUser).order_by(StaffUser.role.asc(), StaffUser.full_name.asc()).all()
    return [serialize_staff_user(row) for row in rows]


@app.post("/staff/users")
def create_staff_user(payload: StaffUserCreate, auth: AuthContext = Depends(require_admin_access), db: Session = Depends(get_db)):
    existing = db.query(StaffUser).filter(StaffUser.email == payload.email).first()
    if existing:
        for key, value in payload.model_dump().items():
            setattr(existing, key, value)
        row = existing
        action = "update"
    else:
        row = StaffUser(**payload.model_dump())
        db.add(row)
        action = "create"
    db.flush()
    audit(db, action, "staff_user", row.id, row.email, actor=auth.actor)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": action}


@app.post("/staff/import-users")
def import_staff_users(auth: AuthContext = Depends(require_admin_access), db: Session = Depends(get_db)):
    imported = 0
    updated = 0
    for entry in load_staff_config().get("staff_users", []):
        existing = db.query(StaffUser).filter(StaffUser.email == entry["email"]).first()
        if existing:
            for key in ["full_name", "role", "title", "is_active", "notes"]:
                setattr(existing, key, entry.get(key, getattr(existing, key)))
            updated += 1
            continue
        db.add(
            StaffUser(
                full_name=entry["full_name"],
                email=entry["email"],
                role=entry["role"],
                title=entry.get("title", ""),
                is_active=entry.get("is_active", True),
                notes=entry.get("notes", ""),
            )
        )
        imported += 1
    audit(db, "import", "staff_users", detail=f"Imported {imported}; updated {updated}", actor=auth.actor)
    db.commit()
    return {"imported": imported, "updated": updated, "status": "complete"}


@app.get("/audit-log")
def audit_log(_auth: AuthContext = Depends(require_admin_access), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()
    return {
        "rows": [
            {
                "id": row.id,
                "actor": row.actor,
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "detail": row.detail,
                "created_at": serialize_dt(row.created_at),
            }
            for row in rows
        ]
    }


@app.get("/ollama/status")
def ollama_status():
    settings = get_settings()
    try:
        response = requests.get(f"{settings.ollama_base_url}/api/tags", timeout=2)
        response.raise_for_status()
        models = response.json().get("models", [])
        return {
            "configured": True,
            "reachable": True,
            "base_url": settings.ollama_base_url,
            "models": [model.get("name") for model in models],
        }
    except requests.RequestException as exc:
        return {
            "configured": True,
            "reachable": False,
            "base_url": settings.ollama_base_url,
            "error": str(exc),
            "note": "Start Ollama on the Mac mini, then retry this endpoint.",
        }


@app.get("/safety")
def safety():
    return {
        "local_first": True,
        "auto_send_email": False,
        "auto_publish": False,
        "secrets_location": ".env",
        "timezone": "America/New_York",
    }
