#!/bin/sh
set -e
export PYTHONPATH=/app

while true; do
  python scripts/fetch_city_calendar.py
  sleep "${WARDOS_CITY_CALENDAR_SYNC_SECONDS:-86400}"
done
