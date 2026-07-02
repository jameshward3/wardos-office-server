#!/bin/sh
set -e

exec sh scripts/run_periodic.sh development_watch WARDOS_DEVELOPMENT_WATCH_SYNC_SECONDS python scripts/fetch_development_watch.py
