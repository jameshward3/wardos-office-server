from __future__ import annotations

import base64
import json
import os
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.memory_database import MEMORY_FIELDS, SHEET_NAMES, memory_sheet_id, memory_sheet_url, serialize_memory_item
from app.models import WardOSMemoryItem


SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
GOOGLE_FIELDS = MEMORY_FIELDS + ["age_days", "open_flag", "record_link", "needs_review"]


def _safe_sheet(title: str) -> str:
    return "'" + title.replace("'", "''") + "'"


def _load_service_account_info() -> dict | None:
    raw_json = os.getenv("WARDOS_GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    file_path = os.getenv("WARDOS_GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()

    if raw_json:
        try:
            return json.loads(raw_json)
        except json.JSONDecodeError:
            try:
                decoded = base64.b64decode(raw_json).decode("utf-8")
                return json.loads(decoded)
            except Exception as exc:
                raise ValueError("WARDOS_GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON or base64 JSON") from exc

    if file_path:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"WardOS Google service account file not found: {file_path}")
        return json.loads(path.read_text(encoding="utf-8"))

    return None


def google_sheet_writer_status() -> dict:
    try:
        info = _load_service_account_info()
    except Exception as exc:
        return {
            "configured": False,
            "ready": False,
            "error": str(exc),
            "sheet_id": memory_sheet_id(),
            "sheet_url": memory_sheet_url(),
        }

    if not info:
        return {
            "configured": False,
            "ready": False,
            "error": "No Google service account credentials configured",
            "sheet_id": memory_sheet_id(),
            "sheet_url": memory_sheet_url(),
        }

    return {
        "configured": True,
        "ready": True,
        "client_email": info.get("client_email", ""),
        "project_id": info.get("project_id", ""),
        "sheet_id": memory_sheet_id(),
        "sheet_url": memory_sheet_url(),
    }


def _sheets_service():
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise RuntimeError("Install google-auth and google-api-python-client in app/requirements.txt, then rebuild the API container") from exc

    info = _load_service_account_info()
    if not info:
        raise RuntimeError("Google service account credentials are not configured")

    credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("sheets", "v4", credentials=credentials, cache_discovery=False)


def _ensure_sheets(service, spreadsheet_id: str, titles: list[str]) -> dict[str, int]:
    spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id, fields="sheets.properties").execute()
    existing = {
        sheet["properties"]["title"]: sheet["properties"]["sheetId"]
        for sheet in spreadsheet.get("sheets", [])
    }
    missing = [title for title in titles if title not in existing]
    if missing:
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": [{"addSheet": {"properties": {"title": title}}} for title in missing]},
        ).execute()
        spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id, fields="sheets.properties").execute()
        existing = {
            sheet["properties"]["title"]: sheet["properties"]["sheetId"]
            for sheet in spreadsheet.get("sheets", [])
        }
    return existing


def _formula_row(row_number: int) -> list[str]:
    return [
        f'=IF(J{row_number}="","",TODAY()-DATEVALUE(LEFT(J{row_number},10)))',
        f'=IF(OR(LOWER(G{row_number})="closed",LOWER(G{row_number})="resolved",LOWER(G{row_number})="archived"),"Closed","Open")',
        f'=IF(K{row_number}="","",HYPERLINK(K{row_number},"Open"))',
        f'=IF(OR(A{row_number}="",E{row_number}="",B{row_number}=""),"Yes","")',
    ]


def _row_values(row: dict, row_number: int) -> list[str]:
    return [str(row.get(field, "") or "") for field in MEMORY_FIELDS] + _formula_row(row_number)


def _sheet_values(rows: list[dict]) -> list[list[str]]:
    values = [GOOGLE_FIELDS]
    for index, row in enumerate(rows, start=2):
        values.append(_row_values(row, index))
    return values


def _dashboard_values() -> list[list[str]]:
    return [
        ["WardOS Memory Dashboard", "", "", "", "", "", ""],
        ["Metric", "Formula / Value", "", "Category", "Count", "Open / Review", "Last Updated"],
        ["Total memory rows", '=COUNTIFS(\'Memory Index\'!A:A,"<>",\'Memory Index\'!A:A,"<>memory_key")', "", "constituents", '=COUNTIF(\'Memory Index\'!B:B,D3)', '=COUNTIFS(\'Memory Index\'!B:B,D3,\'Memory Index\'!T:T,"Open")', '=IFERROR(MAX(DATEVALUE(LEFT(FILTER(\'Memory Index\'!R:R,\'Memory Index\'!R:R<>""),10))),"")'],
        ["Open or review rows", '=COUNTIFS(\'Memory Index\'!A:A,"<>",\'Memory Index\'!A:A,"<>memory_key",\'Memory Index\'!T:T,"Open")', "", "constituent_needs", '=COUNTIF(\'Memory Index\'!B:B,D4)', '=COUNTIFS(\'Memory Index\'!B:B,D4,\'Memory Index\'!T:T,"Open")', ""],
        ["Critical priority rows", '=COUNTIF(\'Memory Index\'!H:H,"critical")', "", "events", '=COUNTIF(\'Memory Index\'!B:B,D5)', '=COUNTIFS(\'Memory Index\'!B:B,D5,\'Memory Index\'!T:T,"Open")', ""],
        ["High priority rows", '=COUNTIF(\'Memory Index\'!H:H,"high")', "", "reports_documents", '=COUNTIF(\'Memory Index\'!B:B,D6)', '=COUNTIFS(\'Memory Index\'!B:B,D6,\'Memory Index\'!T:T,"Open")', ""],
        ["Needs review", '=COUNTIF(\'Memory Index\'!V:V,"Yes")', "", "legislation", '=COUNTIF(\'Memory Index\'!B:B,D7)', '=COUNTIFS(\'Memory Index\'!B:B,D7,\'Memory Index\'!T:T,"Open")', ""],
        ["", "", "", "budget_watch", '=COUNTIF(\'Memory Index\'!B:B,D8)', '=COUNTIFS(\'Memory Index\'!B:B,D8,\'Memory Index\'!T:T,"Open")', ""],
        ["", "", "", "development", '=COUNTIF(\'Memory Index\'!B:B,D9)', '=COUNTIFS(\'Memory Index\'!B:B,D9,\'Memory Index\'!T:T,"Open")', ""],
        ["", "", "", "media_monitor", '=COUNTIF(\'Memory Index\'!B:B,D10)', '=COUNTIFS(\'Memory Index\'!B:B,D10,\'Memory Index\'!T:T,"Open")', ""],
        ["", "", "", "public_safety", '=COUNTIF(\'Memory Index\'!B:B,D11)', '=COUNTIFS(\'Memory Index\'!B:B,D11,\'Memory Index\'!T:T,"Open")', ""],
        ["", "", "", "office_actions", '=COUNTIF(\'Memory Index\'!B:B,D12)', '=COUNTIFS(\'Memory Index\'!B:B,D12,\'Memory Index\'!T:T,"Open")', ""],
        ["", "", "", "sources", '=COUNTIF(\'Memory Index\'!B:B,D13)', '=COUNTIFS(\'Memory Index\'!B:B,D13,\'Memory Index\'!T:T,"Open")', ""],
        ["", "", "", "staff", '=COUNTIF(\'Memory Index\'!B:B,D14)', '=COUNTIFS(\'Memory Index\'!B:B,D14,\'Memory Index\'!T:T,"Open")', ""],
    ]


def _lookup_values() -> list[list[str]]:
    return [
        ["Categories", "Statuses", "Priorities", "Roles", "Source Types"],
        ["constituents", "open", "critical", "admin", "government"],
        ["constituent_needs", "scheduled", "high", "strategy_advisor", "news"],
        ["events", "tracking", "medium", "constituent_services", "facebook_group"],
        ["reports_documents", "in_progress", "normal", "legislative_director", "organization"],
        ["legislation", "closed", "low", "communications_director", "social_media"],
        ["budget_watch", "resolved", "", "budget_analyst", "rss"],
        ["development", "archived", "", "research_assistant", "manual"],
        ["media_monitor", "positive", "", "", ""],
        ["public_safety", "neutral", "", "", ""],
        ["office_actions", "negative", "", "", ""],
        ["sources", "needs_review", "", "", ""],
        ["staff", "disabled", "", "", ""],
    ]


def _readme_values() -> list[list[str]]:
    return [
        ["WardOS Memory Database"],
        ["Purpose", "Shared memory bridge for constituents, needs, events, reports, legislation, budget, development, media, public safety, office actions, sources, and staff."],
        ["Google Sheet", memory_sheet_url()],
        ["Primary Rule", "WardOS/Postgres remains the source of truth. This Sheet is the readable review, export, and recovery layer."],
        ["Refresh Flow", "POST /memory/database/google-sheet/sync"],
        ["Safety", "No automatic emails, texts, posts, or external actions. Staff review is required before outreach."],
        ["Last Sync", datetime.utcnow().isoformat()],
    ]


def _audit_values(sync_result: dict) -> list[list[str]]:
    return [
        ["timestamp", "actor", "action", "entity_type", "entity_id", "detail", "source"],
        [datetime.utcnow().isoformat(), "wardos_google_sheet_sync", "sync", "wardos_memory_items", "google_sheet", json.dumps(sync_result, sort_keys=True), "WardOS API"],
    ]


def sync_memory_to_google_sheet(db: Session, sync_result: dict | None = None) -> dict:
    service = _sheets_service()
    spreadsheet_id = memory_sheet_id()
    rows = [
        serialize_memory_item(row)
        for row in db.query(WardOSMemoryItem).order_by(WardOSMemoryItem.category.asc(), WardOSMemoryItem.updated_at.desc()).all()
    ]
    grouped = {category: [] for category in SHEET_NAMES}
    for row in rows:
        grouped.setdefault(row["category"], []).append(row)

    managed_sheets = ["README", "Dashboard", "Memory Index", *SHEET_NAMES.values(), "Lookups", "Audit Log"]
    _ensure_sheets(service, spreadsheet_id, managed_sheets)

    clear_ranges = [f"{_safe_sheet(title)}!A:V" for title in managed_sheets]
    service.spreadsheets().values().batchClear(
        spreadsheetId=spreadsheet_id,
        body={"ranges": clear_ranges},
    ).execute()

    data = [
        {"range": f"{_safe_sheet('README')}!A1:B7", "values": _readme_values()},
        {"range": f"{_safe_sheet('Dashboard')}!A1:G14", "values": _dashboard_values()},
        {"range": f"{_safe_sheet('Memory Index')}!A1:V{max(1, len(rows) + 1)}", "values": _sheet_values(rows)},
        {"range": f"{_safe_sheet('Lookups')}!A1:E13", "values": _lookup_values()},
        {"range": f"{_safe_sheet('Audit Log')}!A1:G2", "values": _audit_values(sync_result or {})},
    ]
    for category, title in SHEET_NAMES.items():
        values = _sheet_values(grouped.get(category, []))
        data.append({"range": f"{_safe_sheet(title)}!A1:V{max(1, len(values))}", "values": values})

    service.spreadsheets().values().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"valueInputOption": "USER_ENTERED", "data": data},
    ).execute()

    return {
        "status": "synced_to_google_sheet",
        "sheet_id": spreadsheet_id,
        "sheet_url": memory_sheet_url(),
        "rows": len(rows),
        "tabs": managed_sheets,
    }
