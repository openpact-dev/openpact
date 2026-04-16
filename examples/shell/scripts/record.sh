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
  body="$(python3 - "$topic" "$content" "$confidence" <<'PY'
import json, sys
topic, content, confidence = sys.argv[1], sys.argv[2], float(sys.argv[3])
print(json.dumps({"topic": topic, "content": content, "confidence": confidence}))
PY
)"
else
  body="$(python3 - "$topic" "$content" <<'PY'
import json, sys
topic, content = sys.argv[1], sys.argv[2]
print(json.dumps({"topic": topic, "content": content}))
PY
)"
fi

curl -sf -X POST "${base}/v1/pacts/${pact}/knowledge" \
  -H 'content-type: application/json' \
  -d "$body" | python3 -m json.tool
