#!/bin/sh
set -e

exec sh scripts/run_periodic.sh city_bulletins WARDOS_CITY_BULLETINS_SYNC_SECONDS python scripts/fetch_city_bulletins.py
