#!/usr/bin/env bash
# Usage: record.sh <topic> <content> [confidence]
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  cat <<USAGE
record.sh <topic> <content> [confidence]

Record a knowledge entry in the pact. confidence is an optional
0-1 number.

Env:
  OPENPACT_URL  Default http://127.0.0.1:7666
USAGE
  exit "${1:+0}"
fi

base="${OPENPACT_URL:-http://127.0.0.1:7666}"
pact="${OPENPACT_PACT:-default}"
topic="$1"
content="$2"
confidence="${3:-}"

if [[ -n "$confidence" ]]; then
  body="$(jq -n --arg t "$topic" --arg c "$content" --argjson n "$confidence" '{topic:$t, content:$c, confidence:$n}')"
else
  body="$(jq -n --arg t "$topic" --arg c "$content" '{topic:$t, content:$c}')"
fi

curl -sf -X POST "${base}/v1/pacts/${pact}/knowledge" \
  -H 'content-type: application/json' \
  -d "$body" | jq
