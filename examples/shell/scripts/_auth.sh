#!/usr/bin/env bash
# Sourced by the other example scripts. Discovers the daemon's bearer
# token and exports it as OPENPACT_AUTH_HEADER for curl:
#
#   source "$(dirname "$0")/_auth.sh"
#   curl -H "$OPENPACT_AUTH_HEADER" ...
#
# Precedence:
#   1. $OPENPACT_TOKEN                  explicit override
#   2. $OPENPACT_DATA_DIR/daemon.json   host-specific
#   3. ~/.openpact/daemon.json          default dev config

openpact_read_token() {
  local dir file
  if [[ -n "${OPENPACT_TOKEN:-}" ]]; then
    printf '%s' "$OPENPACT_TOKEN"
    return 0
  fi
  dir="${OPENPACT_DATA_DIR:-$HOME/.openpact}"
  file="$dir/daemon.json"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  # Extract the 64-hex apiToken field. `jq` is ubiquitous enough on dev
  # boxes; fall back to a tiny python one-liner when it isn't around.
  if command -v jq >/dev/null 2>&1; then
    jq -r '.apiToken // empty' "$file"
  else
    python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("apiToken",""))' "$file"
  fi
}

_openpact_token="$(openpact_read_token 2>/dev/null || true)"
if [[ -n "$_openpact_token" ]]; then
  export OPENPACT_AUTH_HEADER="Authorization: Bearer $_openpact_token"
else
  export OPENPACT_AUTH_HEADER=""
fi
unset _openpact_token
