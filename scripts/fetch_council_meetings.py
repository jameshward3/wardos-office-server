import argparse

from app.council_meetings import COUNCIL_MEETINGS_URL, fetch_council_meetings, upsert_council_meetings


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Orange City Council meeting updates into WardOS.")
    parser.add_argument("--source-url", default=COUNCIL_MEETINGS_URL)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    payload = fetch_council_meetings(args.source_url)
    if args.dry_run:
        print(f"Fetched {payload['meeting_count']} meetings from {payload['source_url']}")
        return

    from app.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        result = upsert_council_meetings(db, payload)
        print(
            f"Council meetings synced: {result['meeting_count']} fetched, "
            f"{result['imported']} imported, {result['updated']} updated"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
