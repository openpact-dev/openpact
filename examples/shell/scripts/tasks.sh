#!/usr/bin/env bash
# Usage:
#   tasks.sh list [open|claimed|complete]
#   tasks.sh create <title> [description]
#   tasks.sh claim <id>
#   tasks.sh complete <id> [result]
#   tasks.sh release <id>
set -euo pipefail

base="${OPENPACT_URL:-http://127.0.0.1:7666}"
cmd="${1:-}"

usage() {
  cat <<USAGE
tasks.sh <subcommand> [args]

Subcommands:
  list [open|claimed|complete]   List tasks (optionally by status)
  create <title> [description]   Post a new open task
  claim <id>                     Claim an open task
  complete <id> [result]         Mark a task complete
  release <id>                   Revert a claimed task to open

Env:
  OPENPACT_URL  Default http://127.0.0.1:7666
USAGE
}

case "$cmd" in
  -h|--help|"") usage; exit 0 ;;

  list)
    status="${2:-}"
    q=""
    [[ -n "$status" ]] && q="?status=${status}"
    curl -sf "${base}/v1/tasks${q}" | jq
    ;;

  create)
    title="${2:?title required}"
    description="${3:-}"
    if [[ -n "$description" ]]; then
      body="$(jq -n --arg t "$title" --arg d "$description" '{title:$t, description:$d}')"
    else
      body="$(jq -n --arg t "$title" '{title:$t}')"
    fi
    curl -sf -X POST "${base}/v1/tasks" \
      -H 'content-type: application/json' \
      -d "$body" | jq
    ;;

  claim)
    id="${2:?task id required}"
    curl -sf -X PUT "${base}/v1/tasks/${id}/claim" | jq
    ;;

  complete)
    id="${2:?task id required}"
    result="${3:-}"
    if [[ -n "$result" ]]; then
      body="$(jq -n --arg r "$result" '{result:$r}')"
    else
      body="{}"
    fi
    curl -sf -X PUT "${base}/v1/tasks/${id}/complete" \
      -H 'content-type: application/json' \
      -d "$body" | jq
    ;;

  release)
    id="${2:?task id required}"
    curl -sf -X PUT "${base}/v1/tasks/${id}/release" | jq
    ;;

  *)
    echo "unknown subcommand: $cmd" >&2
    usage
    exit 2
    ;;
esac
