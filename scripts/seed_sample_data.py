from app.database import SessionLocal, init_db
from app.models import BudgetWatchItem, ConstituentCase, LegislationItem
from app.settings import get_settings


def main() -> None:
    if not get_settings().sample_mode:
        raise SystemExit("SAMPLE_MODE=false. Set SAMPLE_MODE=true before seeding sample data.")
    init_db()
    db = SessionLocal()
    try:
        if not db.query(ConstituentCase).first():
            db.add(
                ConstituentCase(
                    constituent_name="Sample Resident",
                    topic="Missed sanitation pickup",
                    status="open",
                    priority="normal",
                    notes="Sample only. Needs address and service dates.",
                )
            )
        if not db.query(LegislationItem).first():
            db.add(
                LegislationItem(
                    bill_number="ORD-SAMPLE-001",
                    title="Sample ordinance placeholder",
                    status="tracking",
                    notes="Sample only. Replace with real local source documents.",
                )
            )
        if not db.query(BudgetWatchItem).first():
            db.add(
                BudgetWatchItem(
                    department="Public Works",
                    line_item="Sanitation overtime",
                    fiscal_year="FY2026",
                    status="watching",
                    concern="Sample only. Check variance against prior year when real documents are added.",
                )
            )
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
