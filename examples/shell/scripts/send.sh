#!/usr/bin/env bash
# Usage: send.sh <to|*> <content> [low|normal|high]
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  cat <<USAGE
send.sh <to|*> <content> [low|normal|high]

Send a message. <to> is "*" for broadcast or a peer handle like
anon-foo-12345678. Optional priority defaults to normal.

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

# shellcheck source=./_auth.sh
source "$(dirname "$0")/_auth.sh"

if [[ -n "$priority" ]]; then
  body="$(python3 - "$to" "$content" "$priority" <<'PY'
import json, sys
to, content, priority = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({"to": to, "content": content, "priority": priority}))
PY
)"
else
  body="$(python3 - "$to" "$content" <<'PY'
import json, sys
to, content = sys.argv[1], sys.argv[2]
print(json.dumps({"to": to, "content": content}))
PY
)"
fi

curl -sf -X POST "${base}/v1/pacts/${pact}/messages" \
  -H 'content-type: application/json' \
  ${OPENPACT_AUTH_HEADER:+-H "$OPENPACT_AUTH_HEADER"} \
  -d "$body" | python3 -m json.tool
