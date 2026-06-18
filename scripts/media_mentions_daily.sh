#!/bin/sh
set -e
export PYTHONPATH=/app

while true; do
  python scripts/fetch_media_mentions.py
  sleep "${WARDOS_MEDIA_SYNC_SECONDS:-3600}"
done
