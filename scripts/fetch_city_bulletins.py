import argparse

from app.city_bulletins import fetch_city_bulletins, upsert_city_bulletins


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch City of Orange homepage bulletins into WardOS.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    payload = fetch_city_bulletins()
    if args.dry_run:
        print(f"Fetched {payload['bulletin_count']} bulletins from {payload['source_url']}")
        return

    from app.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        result = upsert_city_bulletins(db, payload)
        print(
            f"City bulletins synced: {result['bulletin_count']} fetched, "
            f"{result['imported']} imported, {result['updated']} updated"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
