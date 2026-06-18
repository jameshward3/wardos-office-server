import argparse

from app.media_ingest import fetch_media_mentions, upsert_media_mentions


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch configured public RSS media mentions into WardOS.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    payload = fetch_media_mentions()
    if args.dry_run:
        print(f"Fetched {payload['mention_count']} mentions from {payload['source_count']} RSS media sources")
        return

    from app.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        result = upsert_media_mentions(db, payload)
        print(
            f"Media mentions synced: {result['mention_count']} fetched, "
            f"{result['imported']} imported, {result['skipped']} skipped"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
