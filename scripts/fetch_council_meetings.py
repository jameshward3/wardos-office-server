import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.environ.setdefault("WARDOS_DATA_DIR", str(ROOT / "data"))

from app.council_meetings import (
    COUNCIL_MEETINGS_URL,
    extract_legislation_items,
    fetch_council_meetings,
    upsert_council_meetings,
    upsert_legislation_items,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Orange City Council meeting updates into WardOS.")
    parser.add_argument("--source-url", default=COUNCIL_MEETINGS_URL)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    payload = fetch_council_meetings(args.source_url)
    legislation_payload = extract_legislation_items(payload)
    if args.dry_run:
        print(
            f"Fetched {payload['meeting_count']} meetings and "
            f"{legislation_payload['item_count']} legislation items from {payload['source_url']}"
        )
        return

    from app.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        result = upsert_council_meetings(db, payload)
        legislation_result = upsert_legislation_items(db, legislation_payload)
        print(
            f"Council meetings synced: {result['meeting_count']} fetched, "
            f"{result['imported']} imported, {result['updated']} updated; "
            f"legislation: {legislation_result['item_count']} fetched, "
            f"{legislation_result['imported']} imported, {legislation_result['updated']} updated"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
