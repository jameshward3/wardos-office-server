import argparse

from app.city_calendar import fetch_city_calendar, upsert_city_calendar_events


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch City of Orange calendar events into WardOS.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    payload = fetch_city_calendar()
    if args.dry_run:
        print(f"Fetched {payload['event_count']} events from {payload['feed_count']} city calendar feeds")
        return

    from app.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        result = upsert_city_calendar_events(db, payload)
        print(
            f"City calendar synced: {result['event_count']} fetched, "
            f"{result['imported']} imported, {result['updated']} updated"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
