#!/bin/sh
set -e

exec sh scripts/run_periodic.sh council_meetings WARDOS_COUNCIL_MEETINGS_SYNC_SECONDS python scripts/fetch_council_meetings.py
