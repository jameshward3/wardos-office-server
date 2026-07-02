#!/bin/sh
set -eu

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <job-name> <interval-env-var> <command> [args...]" >&2
  exit 2
fi

JOB_NAME="$1"
INTERVAL_ENV_VAR="$2"
shift 2

export PYTHONPATH="${PYTHONPATH:-/app}"

while true; do
  STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "{\"job\":\"${JOB_NAME}\",\"event\":\"start\",\"started_at\":\"${STARTED_AT}\"}"
  if "$@"; then
    FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "{\"job\":\"${JOB_NAME}\",\"event\":\"success\",\"finished_at\":\"${FINISHED_AT}\"}"
  else
    STATUS="$?"
    FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "{\"job\":\"${JOB_NAME}\",\"event\":\"failure\",\"status\":${STATUS},\"finished_at\":\"${FINISHED_AT}\"}" >&2
  fi

  eval "INTERVAL=\${${INTERVAL_ENV_VAR}:-86400}"
  sleep "$INTERVAL"
done
