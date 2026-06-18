import os
import json
from pathlib import Path
from typing import Any


CONFIG_PATHS = [
    Path("/app/data/config/media_sources.json"),
    Path(os.getenv("WARDOS_DATA_DIR", "/app/data")) / "config" / "media_sources.json",
    Path("data/config/media_sources.json"),
    Path(__file__).resolve().parents[1] / "data" / "config" / "media_sources.json",
]


def load_media_config() -> dict[str, Any]:
    for path in CONFIG_PATHS:
        if path.exists():
            return json.loads(path.read_text())
    return {
        "government": [],
        "local_news": [],
        "community": [],
        "social_media": {},
        "intelligence_topics": [],
        "ai_analysis": {},
        "orange_pulse_map": {},
        "alerts": {},
        "story_actions": {},
    }


def flatten_source_entries(config: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for section in ("government", "local_news", "community"):
        for item in config.get(section, []):
            urls = item.get("urls") or [item.get("rss") or item.get("url") or ""]
            for index, url in enumerate(urls):
                rows.append(
                    {
                        "name": item["name"] if len(urls) == 1 else f"{item['name']} #{index + 1}",
                        "source_type": item.get("type", section),
                        "url": url or "",
                        "priority": item.get("priority", "medium"),
                        "category": item.get("category") or ",".join(item.get("categories", [])),
                        "authentication_required": item.get("authentication_required", False),
                        "source": item.get("source", ""),
                        "section": section,
                    }
                )

    social = config.get("social_media", {})
    for platform, platform_config in social.items():
        for key, values in platform_config.items():
            for value in values:
                rows.append(
                    {
                        "name": f"{platform}:{value}",
                        "source_type": platform,
                        "url": "",
                        "priority": "medium",
                        "category": key,
                        "authentication_required": platform in {"instagram", "facebook", "threads"},
                        "source": key,
                        "section": "social_media",
                    }
                )
    return rows
