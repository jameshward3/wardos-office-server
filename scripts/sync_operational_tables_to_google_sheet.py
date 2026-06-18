from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.google_sheet_sync import _ensure_sheets, _safe_sheet, _sheets_service
from app.models import Constituent, ConstituentCase, Event
from app.memory_database import memory_sheet_id, memory_sheet_url


CONSTITUENT_SHEET = "Constituent Directory"
CASE_SHEET = "Constituent Case Log"
EVENT_SHEET = "Event Log"


def text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
      return value.isoformat()
    if isinstance(value, date):
      return value.isoformat()
    return str(value)


def constituent_values(db: Session) -> list[list[str]]:
    headers = [
        "id",
        "voter_id",
        "first_name",
        "last_name",
        "full_name",
        "street_no",
        "street",
        "apt",
        "city",
        "state",
        "zip_code",
        "ward",
        "subgroup",
        "voter_status",
        "mailin_request_date",
        "mailin_sent_date",
        "mailin_received_date",
        "days_to_return",
        "source_file",
        "notes",
        "created_at",
        "updated_at",
    ]
    rows = [headers]
    for row in db.query(Constituent).order_by(Constituent.ward.asc(), Constituent.full_name.asc()).all():
        rows.append([text(getattr(row, field)) for field in headers])
    return rows


def case_values(db: Session) -> list[list[str]]:
    headers = [
        "id",
        "created_at",
        "constituent_name",
        "address_line",
        "phone",
        "email",
        "topic",
        "status",
        "priority",
        "notes",
        "latitude",
        "longitude",
    ]
    rows = [headers]
    for row in db.query(ConstituentCase).order_by(ConstituentCase.created_at.asc(), ConstituentCase.id.asc()).all():
        rows.append([text(getattr(row, field)) for field in headers])
    return rows


def event_values(db: Session) -> list[list[str]]:
    headers = [
        "id",
        "created_at",
        "title",
        "starts_at",
        "location",
        "event_type",
        "status",
        "notes",
        "source_url",
        "source_id",
    ]
    rows = [headers]
    for row in db.query(Event).order_by(Event.starts_at.asc(), Event.id.asc()).all():
        rows.append([text(getattr(row, field)) for field in headers])
    return rows


def sync_operational_tables() -> dict:
    init_db()
    db = SessionLocal()
    try:
        service = _sheets_service()
        spreadsheet_id = memory_sheet_id()
        sheet_names = [CONSTITUENT_SHEET, CASE_SHEET, EVENT_SHEET]
        _ensure_sheets(service, spreadsheet_id, sheet_names)

        service.spreadsheets().values().batchClear(
            spreadsheetId=spreadsheet_id,
            body={"ranges": [f"{_safe_sheet(name)}!A:ZZ" for name in sheet_names]},
        ).execute()

        data = [
            {"range": f"{_safe_sheet(CONSTITUENT_SHEET)}!A1:V{max(1, len(constituent_values(db)))}", "values": constituent_values(db)},
            {"range": f"{_safe_sheet(CASE_SHEET)}!A1:L{max(1, len(case_values(db)))}", "values": case_values(db)},
            {"range": f"{_safe_sheet(EVENT_SHEET)}!A1:J{max(1, len(event_values(db)))}", "values": event_values(db)},
        ]

        service.spreadsheets().values().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"valueInputOption": "USER_ENTERED", "data": data},
        ).execute()

        return {
            "status": "synced",
            "sheet_id": spreadsheet_id,
            "sheet_url": memory_sheet_url(),
            "tabs": sheet_names,
            "constituents": len(data[0]["values"]) - 1,
            "cases": len(data[1]["values"]) - 1,
            "events": len(data[2]["values"]) - 1,
        }
    finally:
        db.close()


if __name__ == "__main__":
    print(sync_operational_tables())
