#!/bin/sh
set -e

exec sh scripts/run_periodic.sh city_calendar WARDOS_CITY_CALENDAR_SYNC_SECONDS python scripts/fetch_city_calendar.py
