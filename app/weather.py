from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests


TIMEZONE = ZoneInfo("America/New_York")
CACHE_PATH = Path("/app/data/weather_cache/orange_nj_today.json")
WEATHER_REFRESH_SECONDS = 3600

WEATHER_CODES = {
    0: ("Sunny", "☀"),
    1: ("Mostly Sunny", "🌤"),
    2: ("Partly Cloudy", "⛅"),
    3: ("Cloudy", "☁"),
    45: ("Fog", "🌫"),
    48: ("Fog", "🌫"),
    51: ("Light Drizzle", "🌦"),
    53: ("Drizzle", "🌦"),
    55: ("Heavy Drizzle", "🌧"),
    61: ("Light Rain", "🌦"),
    63: ("Rain", "🌧"),
    65: ("Heavy Rain", "🌧"),
    71: ("Light Snow", "🌨"),
    73: ("Snow", "🌨"),
    75: ("Heavy Snow", "❄"),
    80: ("Rain Showers", "🌦"),
    81: ("Rain Showers", "🌧"),
    82: ("Heavy Showers", "⛈"),
    95: ("Thunderstorm", "⛈"),
    96: ("Thunderstorm", "⛈"),
    99: ("Thunderstorm", "⛈"),
}


def _fallback() -> dict:
    return {
        "ok": True,
        "from_cache": True,
        "location": "Orange, NJ",
        "temperature": 62,
        "high": 74,
        "low": 52,
        "condition": "Sunny",
        "symbol": "☀",
        "wind_mph": 8,
        "humidity": 45,
        "updated_at": datetime.now(TIMEZONE).isoformat(),
        "note": "Fallback sample shown until live weather is available.",
    }


def _read_cache() -> dict | None:
    if not CACHE_PATH.exists():
        return None
    return json.loads(CACHE_PATH.read_text())


def _cache_is_fresh(payload: dict) -> bool:
    updated_at = payload.get("updated_at")
    if not updated_at:
        return False
    try:
        updated = datetime.fromisoformat(str(updated_at))
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=TIMEZONE)
        return datetime.now(TIMEZONE) - updated < timedelta(seconds=WEATHER_REFRESH_SECONDS)
    except ValueError:
        return False


def _with_refresh_metadata(payload: dict) -> dict:
    updated_at = payload.get("updated_at")
    next_update_at = ""
    try:
        updated = datetime.fromisoformat(str(updated_at))
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=TIMEZONE)
        next_update_at = (updated + timedelta(seconds=WEATHER_REFRESH_SECONDS)).isoformat()
    except (TypeError, ValueError):
        pass
    return {
        **payload,
        "refresh_interval_seconds": WEATHER_REFRESH_SECONDS,
        "next_update_at": next_update_at,
    }


def _write_cache(payload: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, indent=2))


def get_orange_weather() -> dict:
    cached = _read_cache()
    if cached and _cache_is_fresh(cached):
        cached["from_cache"] = True
        return _with_refresh_metadata(cached)

    url = (
        "https://api.open-meteo.com/v1/forecast"
        "?latitude=40.7707&longitude=-74.2326"
        "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"
        "&daily=temperature_2m_max,temperature_2m_min"
        "&temperature_unit=fahrenheit&wind_speed_unit=mph"
        "&timezone=America%2FNew_York&forecast_days=1"
    )
    try:
        response = requests.get(url, timeout=8)
        response.raise_for_status()
        data = response.json()
        current = data.get("current", {})
        daily = data.get("daily", {})
        code = current.get("weather_code", 0)
        condition, symbol = WEATHER_CODES.get(code, ("Current Conditions", "◌"))
        payload = {
            "ok": True,
            "from_cache": False,
            "location": "Orange, NJ",
            "temperature": round(current.get("temperature_2m")),
            "high": round((daily.get("temperature_2m_max") or [0])[0]),
            "low": round((daily.get("temperature_2m_min") or [0])[0]),
            "condition": condition,
            "symbol": symbol,
            "wind_mph": round(current.get("wind_speed_10m", 0)),
            "humidity": round(current.get("relative_humidity_2m", 0)),
            "updated_at": datetime.now(TIMEZONE).isoformat(),
            "source": "Open-Meteo",
        }
        _write_cache(payload)
        return _with_refresh_metadata(payload)
    except (requests.RequestException, TypeError, ValueError):
        if cached:
            cached["from_cache"] = True
            return _with_refresh_metadata(cached)
        return _with_refresh_metadata(_fallback())
