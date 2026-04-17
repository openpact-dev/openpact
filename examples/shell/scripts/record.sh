#!/usr/bin/env bash
# Usage: record.sh <topic> <content>
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  cat <<USAGE
record.sh <topic> <content>

Record a knowledge entry in the pact. content renders as markdown
on the dashboard.

Env:
  OPENPACT_URL  Default http://127.0.0.1:7666
USAGE
  exit "${1:+0}"
fi

base="${OPENPACT_URL:-http://127.0.0.1:7666}"
pact="${OPENPACT_PACT:-default}"
topic="$1"
content="$2"

# shellcheck source=./_auth.sh
source "$(dirname "$0")/_auth.sh"

body="$(python3 - "$topic" "$content" <<'PY'
import json, sys
topic, content = sys.argv[1], sys.argv[2]
print(json.dumps({"topic": topic, "content": content}))
PY
)"

curl -sf -X POST "${base}/v1/pacts/${pact}/knowledge" \
  -H 'content-type: application/json' \
  ${OPENPACT_AUTH_HEADER:+-H "$OPENPACT_AUTH_HEADER"} \
  -d "$body" | python3 -m json.tool
