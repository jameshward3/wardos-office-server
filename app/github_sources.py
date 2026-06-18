import json
from datetime import datetime
from pathlib import Path
from statistics import mean
from zoneinfo import ZoneInfo

import requests

from app.settings import get_settings


TIMEZONE = ZoneInfo("America/New_York")
CACHE_DIR = Path("/app/data/github_cache")

SOURCES = {
    "budget": {
        "label": "Orange Budget Dashboard",
        "repo": "jameshward3/OrangeBudgetDashboard",
        "path": "historical_budget_dataset.json",
        "raw_url": "https://raw.githubusercontent.com/jameshward3/OrangeBudgetDashboard/main/historical_budget_dataset.json",
    },
    "progress": {
        "label": "Personal Progress",
        "repo": "jameshward3/Progress",
        "path": "metrics.json",
        "raw_url": "https://raw.githubusercontent.com/jameshward3/Progress/main/metrics.json",
    },
    "legislation": {
        "label": "Legislative Tracker",
        "repo": "jameshward3/Legislative_tracker",
        "path": "metrics.json",
        "raw_url": "https://raw.githubusercontent.com/jameshward3/Legislative_tracker/main/metrics.json",
    },
}


def _headers() -> dict[str, str]:
    settings = get_settings()
    headers = {"Accept": "application/vnd.github.raw+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _cache_path(name: str) -> Path:
    return CACHE_DIR / f"{name}.json"


def _read_cache(name: str):
    path = _cache_path(name)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _write_cache(name: str, payload) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(name).write_text(json.dumps(payload, indent=2))


def fetch_source(name: str) -> dict:
    source = SOURCES[name]
    fetched_at = datetime.now(TIMEZONE).isoformat()
    try:
        response = requests.get(source["raw_url"], headers=_headers(), timeout=10)
        response.raise_for_status()
        data = response.json()
        envelope = {
            "ok": True,
            "from_cache": False,
            "fetched_at": fetched_at,
            "source": source,
            "data": data,
        }
        _write_cache(name, envelope)
        return envelope
    except requests.RequestException as exc:
        cached = _read_cache(name)
        if cached:
            cached["ok"] = True
            cached["from_cache"] = True
            cached["cache_note"] = "GitHub was unreachable; serving latest local cache."
            return cached
        return {
            "ok": False,
            "from_cache": False,
            "fetched_at": fetched_at,
            "source": source,
            "error": str(exc),
            "data": None,
        }


def normalize_budget() -> dict:
    envelope = fetch_source("budget")
    rows = envelope.get("data") or []
    rows = sorted(rows, key=lambda row: row.get("year", 0))
    latest = rows[-1] if rows else {}
    previous = rows[-2] if len(rows) > 1 else {}

    def growth(key: str):
        if not latest or not previous or not previous.get(key):
            return None
        return round(((latest.get(key, 0) - previous.get(key, 0)) / previous[key]) * 100, 2)

    return {
        **envelope,
        "summary": {
            "latest_year": latest.get("year"),
            "total_budget": latest.get("totalBudget"),
            "tax_levy": latest.get("taxLevy"),
            "non_tax_revenue": latest.get("nonTaxRevenue"),
            "surplus": latest.get("surplus"),
            "debt_service": latest.get("debtService"),
            "budget_growth_percent": growth("totalBudget"),
            "tax_levy_growth_percent": growth("taxLevy"),
            "years_tracked": len(rows),
        },
        "rows": rows,
    }


def normalize_metrics(name: str) -> dict:
    envelope = fetch_source(name)
    data = envelope.get("data") or {}
    commitments = data.get("commitments", [])
    if name == "legislation" and commitments and "first 100 days" in str(data.get("summary", {}).get("title", "")).lower():
        return {
            **envelope,
            "ok": False,
            "data_quality": "Legislative_tracker currently contains progress metrics, not legislation records.",
            "summary": {
                "title": "Legislative Tracker",
                "average_progress": 0,
                "items_tracked": 0,
                "in_progress": 0,
                "completed": 0,
            },
            "items": [],
        }
    progress_values = [item.get("progress", 0) for item in commitments if isinstance(item.get("progress", 0), (int, float))]
    summary = data.get("summary", {})
    normalized_summary = {
        **summary,
        "average_progress": round(mean(progress_values), 1) if progress_values else summary.get("overallProgress", 0),
        "items_tracked": len(commitments),
        "in_progress": len([item for item in commitments if str(item.get("status", "")).lower() == "in progress"]),
        "completed": len([item for item in commitments if str(item.get("status", "")).lower() == "completed"]),
    }
    return {
        **envelope,
        "summary": normalized_summary,
        "items": commitments,
    }


def aggregate_office_data() -> dict:
    budget = normalize_budget()
    progress = normalize_metrics("progress")
    legislation = normalize_metrics("legislation")
    return {
        "fetched_at": datetime.now(TIMEZONE).isoformat(),
        "sources": SOURCES,
        "budget": budget,
        "progress": progress,
        "legislation": legislation,
    }
