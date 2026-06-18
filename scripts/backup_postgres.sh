#!/bin/bash
set -e

mkdir -p data/backups
docker exec wardos_postgres pg_dump -U wardos wardos > "data/backups/wardos_$(date +%Y%m%d_%H%M%S).sql"

