import argparse
import csv
from datetime import datetime
from pathlib import Path

from app.database import SessionLocal, init_db
from app.models import Constituent


DEFAULT_SUBGROUP = "May 2026 Mail-In Voters"


def parse_date(value: str):
    value = (value or "").strip()
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def parse_int(value: str):
    value = (value or "").strip()
    if not value:
        return None
    return int(value)


def clean(value: str) -> str:
    return (value or "").strip()


def full_name(row: dict[str, str]) -> str:
    return " ".join(part for part in [clean(row.get("first_name")), clean(row.get("last_name"))] if part)


def import_csv(path: Path, subgroup: str) -> dict[str, int]:
    init_db()
    db = SessionLocal()
    created = 0
    updated = 0
    skipped = 0
    try:
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                voter_id = clean(row.get("voter_id"))
                if not voter_id:
                    skipped += 1
                    continue

                existing = db.query(Constituent).filter(Constituent.voter_id == voter_id).first()
                payload = {
                    "voter_id": voter_id,
                    "first_name": clean(row.get("first_name")).title(),
                    "last_name": clean(row.get("last_name")).title(),
                    "full_name": full_name(row).title(),
                    "street_no": clean(row.get("street_no")),
                    "street": clean(row.get("street")).title(),
                    "apt": clean(row.get("apt")),
                    "city": clean(row.get("city")).title(),
                    "state": clean(row.get("state")).upper(),
                    "zip_code": clean(row.get("zip")),
                    "ward": clean(row.get("ward")).title(),
                    "subgroup": subgroup,
                    "voter_status": clean(row.get("status")).title(),
                    "mailin_request_date": parse_date(row.get("req_date")),
                    "mailin_sent_date": parse_date(row.get("sent_date")),
                    "mailin_received_date": parse_date(row.get("received_date")),
                    "days_to_return": parse_int(row.get("days_to_return")),
                    "source_file": path.name,
                    "notes": "Registered mail-in voter subgroup for the May 2026 election.",
                }

                if existing:
                    for key, value in payload.items():
                        setattr(existing, key, value)
                    updated += 1
                else:
                    db.add(Constituent(**payload))
                    created += 1

        db.commit()
        return {"created": created, "updated": updated, "skipped": skipped}
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import constituent voter records into WardOS.")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--subgroup", default=DEFAULT_SUBGROUP)
    args = parser.parse_args()
    result = import_csv(args.csv_path, args.subgroup)
    print(
        f"Imported constituents: {result['created']} created, "
        f"{result['updated']} updated, {result['skipped']} skipped"
    )


if __name__ == "__main__":
    main()
