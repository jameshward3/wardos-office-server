from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

DATA_DIR = Path("/app/data")
TIMEZONE = ZoneInfo("America/New_York")


def read_folder(folder: str) -> list[str]:
    path = DATA_DIR / folder
    if not path.exists():
        return []
    return sorted(p.name for p in path.iterdir() if p.is_file())


def generate_daily_briefing() -> dict:
    return {
        "date": datetime.now(TIMEZONE).isoformat(),
        "title": "South Ward Daily Briefing",
        "open_inputs": {
            "inbox": read_folder("inbox"),
            "agendas": read_folder("agendas"),
            "minutes": read_folder("minutes"),
            "constituent_cases": read_folder("constituent_cases"),
            "legislation": read_folder("legislation"),
            "budget": read_folder("budget"),
            "ward_report": read_folder("ward_report"),
        },
        "summary": "Briefing engine connected. AI summarization comes next.",
        "recommended_actions": [
            "Review new inbox items",
            "Check agenda uploads",
            "Update constituent cases",
            "Review budget documents",
        ],
        "local_first_note": "No outbound email or external posting is performed by this server.",
    }

