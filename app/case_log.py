import csv
from datetime import datetime
from pathlib import Path


CASE_LOG_FIELDS = [
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


CASE_LOG_PATH = Path("/app/data/exports/constituent_cases.csv")


def serialize_case(row) -> dict:
    return {
        "id": row.id,
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "constituent_name": row.constituent_name,
        "address_line": row.address_line,
        "phone": row.phone,
        "email": row.email,
        "topic": row.topic,
        "status": row.status,
        "priority": row.priority,
        "notes": row.notes,
        "latitude": row.latitude if row.latitude is not None else "",
        "longitude": row.longitude if row.longitude is not None else "",
    }


def write_case_log(rows) -> Path:
    CASE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CASE_LOG_PATH.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=CASE_LOG_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow(serialize_case(row))
    return CASE_LOG_PATH


def read_case_log() -> list[dict]:
    if not CASE_LOG_PATH.exists():
        return []
    with CASE_LOG_PATH.open("r", newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def parse_case_datetime(value: str):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None
