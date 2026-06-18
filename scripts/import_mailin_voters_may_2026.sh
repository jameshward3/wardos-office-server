#!/bin/bash
set -e

docker compose exec api python scripts/import_constituents.py \
  /app/data/constituents/mailin_voters_may_2026_south_ward.csv
