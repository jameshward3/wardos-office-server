import argparse

from app.development_watch import fetch_development_watch, upsert_development_watch


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Orange Planning/Zoning development watch records into WardOS.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    payload = fetch_development_watch()
    if args.dry_run:
        print(
            f"Fetched {payload['meeting_count']} board meetings and "
            f"{payload['watch_count']} development watch records"
        )
        return

    from app.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        result = upsert_development_watch(db, payload)
        print(
            "Development watch synced: "
            f"{payload['meeting_count']} meetings fetched, "
            f"{payload['watch_count']} watch records fetched, "
            f"{result['imported_meetings']} meetings imported, "
            f"{result['updated_meetings']} meetings updated, "
            f"{result['imported_watch_items']} watch items imported, "
            f"{result['updated_watch_items']} watch items updated"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
