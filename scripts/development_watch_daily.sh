#!/bin/sh
set -e
export PYTHONPATH=/app

while true; do
  python scripts/fetch_development_watch.py
  sleep "${WARDOS_DEVELOPMENT_WATCH_SYNC_SECONDS:-86400}"
done
