#!/usr/bin/env bash
# Usage: recall.sh [topic] [limit]
# Lists recent knowledge entries, optionally filtered by topic.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<USAGE
recall.sh [topic] [limit]

List knowledge entries from the OpenPact daemon. With no args, returns
the most recent entries (limit 20). With a topic, filters by that
exact topic.

Env:
  OPENPACT_URL  Default http://127.0.0.1:7666
USAGE
  exit 0
fi

base="${OPENPACT_URL:-http://127.0.0.1:7666}"
pact="${OPENPACT_PACT:-default}"
topic="${1:-}"
limit="${2:-20}"

query="?limit=${limit}"
if [[ -n "$topic" ]]; then
  query="${query}&topic=${topic}"
fi

curl -sf "${base}/v1/pacts/${pact}/knowledge${query}" | python3 -c '
import json, sys
data = json.load(sys.stdin)
entries = [
    {
        "id": entry["id"],
        "ts": entry["timestamp"],
        "topic": entry["payload"]["topic"],
        "content": entry["payload"]["content"],
    }
    for entry in data.get("entries", [])
]
json.dump(entries, sys.stdout, indent=2)
sys.stdout.write("\n")
'
