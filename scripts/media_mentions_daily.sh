#!/bin/sh
set -e

exec sh scripts/run_periodic.sh media_mentions WARDOS_MEDIA_SYNC_SECONDS python scripts/fetch_media_mentions.py
