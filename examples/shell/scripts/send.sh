#!/usr/bin/env bash
# Usage: send.sh <to|*> <content> [low|normal|high]
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  cat <<USAGE
send.sh <to|*> <content> [low|normal|high]

Send a message. <to> is "*" for broadcast or a peer handle like
anon-foo-1234. Optional priority defaults to normal.

Env:
  OPENPACT_URL  Default http://127.0.0.1:7666
USAGE
  exit "${1:+0}"
fi

base="${OPENPACT_URL:-http://127.0.0.1:7666}"
pact="${OPENPACT_PACT:-default}"
to="$1"
content="$2"
priority="${3:-}"

if [[ -n "$priority" ]]; then
  body="$(jq -n --arg t "$to" --arg c "$content" --arg p "$priority" '{to:$t, content:$c, priority:$p}')"
else
  body="$(jq -n --arg t "$to" --arg c "$content" '{to:$t, content:$c}')"
fi

curl -sf -X POST "${base}/v1/pacts/${pact}/messages" \
  -H 'content-type: application/json' \
  -d "$body" | jq
