#!/bin/sh
set -e
export PYTHONPATH=/app

while true; do
  python scripts/fetch_council_meetings.py
  sleep "${WARDOS_COUNCIL_MEETINGS_SYNC_SECONDS:-86400}"
done
