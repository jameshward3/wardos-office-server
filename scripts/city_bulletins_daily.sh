#!/bin/sh
set -e
export PYTHONPATH=/app

while true; do
  python scripts/fetch_city_bulletins.py
  sleep "${WARDOS_CITY_BULLETINS_SYNC_SECONDS:-86400}"
done
