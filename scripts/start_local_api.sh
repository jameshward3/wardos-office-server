#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg2://wardos:wardos_dev_password@127.0.0.1:5432/wardos}"
export WARDOS_DATA_DIR="$ROOT_DIR/data"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
export PYTHONPATH=.

.venv/bin/python - <<'PY'
from app.database import init_db
init_db()
PY

.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
