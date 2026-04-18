<!-- BEGIN: openpact recipe — paste this block into your project's CLAUDE.md -->

## Shared memory via OpenPact

This project uses an OpenPact daemon as shared, append-only memory.
Treat it as a long-lived notebook every agent (and the human) reads
and writes. The daemon listens on `127.0.0.1:7666` by default. If it
is not running, the curl commands below fail with `Connection
refused`. Surface that and stop. Do not try to start it yourself.

One daemon holds many pacts. Pick which pact these recipes address by
setting `OPENPACT_PACT` to its alias. Leave it unset to use whatever
alias the daemon considers current (`openpact list` marks it with `*`).

The REST API requires a bearer token. It is auto-minted on first boot
into `~/.openpact/daemon.json` with mode 0600. Two tiny shell helpers
below avoid an extra `jq` install — Node 22+ is already required by
the OpenPact CLI itself, so `node` is always on PATH.

```bash
OPENPACT_URL="${OPENPACT_URL:-http://127.0.0.1:7666}"
OPENPACT_PACT="${OPENPACT_PACT:-default}"

# Pull a dotted path out of stdin JSON, e.g. `| jget cursor`.
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const v='$1'.split('.').filter(Boolean).reduce((o,k)=>o==null?o:o[k],j);process.stdout.write(v==null?'':typeof v==='object'?JSON.stringify(v):String(v));});"; }

# Percent-encode one value, e.g. `$(urlenc "$CURSOR")`.
urlenc() { node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" -- "$1"; }

OPENPACT_TOKEN="${OPENPACT_TOKEN:-$(cat "${OPENPACT_DATA_DIR:-$HOME/.openpact}/daemon.json" | jget apiToken)}"
AUTH=(-H "Authorization: Bearer $OPENPACT_TOKEN")
```

Every pact-scoped request carries `"${AUTH[@]}"`. `/v1/ping` is the
only route that works without the header.

Prefer automatic reads? Run `openpact install claude-code` once in the
project. It writes SessionStart and UserPromptSubmit hooks into
`.claude/settings.json` so Claude Code injects pact status and new
peer activity at session start and before each prompt. The recipes
below still matter for writes. The install teaches Claude how to read
the pact. It does not teach it when to record to it.

### Coordinating with other agents

Two jobs, two primitives. Picking the wrong one is the most common mistake:

- **Discovery — "what's already here for me?"** Use the typed list
  endpoints with filters. `GET /tasks?status=open` + client-side filter on
  `assigned_to` finds work reserved for you. `GET /messages?agent_id=<h>&since=<ts>`
  scopes to one author. `GET /knowledge?topic=<t>` surfaces prior decisions.
  Answers "what exists right now" in one request.
- **Tailing — "wake me when something new happens."** Use `GET /changes`.
  The feed is chronological (oldest-first), so start by calling
  `?from=head` once to get a cursor at HEAD, then loop
  `?since=<that>&wait=30`. Without `from=head`, a bare call replays
  the entire pact history.

Do not use `/changes` for discovery. If you catch yourself sleep-polling a
list endpoint, that's the signal to switch to `/changes` with a cursor.

### When to read

- At the start of a non-trivial task, list recent knowledge filtered by
  the relevant topic. If something is on point, factor it in.
- Before proposing an architectural decision or convention change,
  check whether one already exists.

### When to write

- After making a non-obvious call (a tradeoff, a workaround, a chosen
  convention), record it as knowledge with a clear topic. Do not record
  what the diff already shows.
- When you start something other agents might trip over (a long
  refactor, a temporary breakage), broadcast a message.
- When there is work the user wants tracked across sessions, post a
  task instead of a TODO comment.

### Recipes

Every GET below returns JSON: paginated endpoints are
`{entries: [...], cursor, has_more}`, single-entry reads are the
entry itself. Parse the response shape you need directly. No extra
tooling required.

**List recent knowledge on a topic:**

```bash
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge?topic=routing&limit=20"
```

**Record a discovery:**

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" \
  -H "content-type: application/json" \
  -d '{"topic":"routing","content":"Use the resolver factory in src/router.ts. The legacy switch in legacy/route-map.ts is deprecated."}'
```

**List open tasks:**

```bash
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks?status=open"
```

**Post a task for another agent (or future you):**

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks" \
  -H "content-type: application/json" \
  -d '{"title":"Migrate auth middleware off legacy session store","description":"Tracking ticket; details in CLAUDE.md decision log."}'
```

**Reserve a task for one specific peer:**

```bash
# Only the assigned peer can claim. Others get HTTP 409 NOT_ASSIGNEE.
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks" \
  -H "content-type: application/json" \
  -d '{"title":"Review the auth migration PR","assigned_to":"anon-rat-12345678"}'
```

**Claim a task before working on it:**

```bash
# Response is the full TaskState; no `.task` wrapper.
curl -sf "${AUTH[@]}" -X PUT "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks/<id>/claim"
```

If the response is HTTP 409 with `error: "TASK_NOT_OPEN"`, another
agent already owns it. Pick a different task. If it's HTTP 409 with
`error: "NOT_ASSIGNEE"`, the task is reserved for another peer.

**Complete a task:**

```bash
curl -sf "${AUTH[@]}" -X PUT "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks/<id>/complete" \
  -H "content-type: application/json" \
  -d '{"result":"PR #123 merged"}'
```

**Broadcast a short status message:**

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages" \
  -H "content-type: application/json" \
  -d '{"content":"Starting refactor of src/router/*; expect churn for ~30 min."}'
```

**Thread a reply under an earlier message:**

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages" \
  -H "content-type: application/json" \
  -d '{"content":"Acknowledged; adjusting my branch.","reply_to":"a7f2bcde-411"}'

# Read a thread by asking for everything that refs the parent message:
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/entries/a7f2bcde-411/referenced-by"
```

**See messages since a cursor:**

```bash
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages?since=2026-04-01T00:00:00Z"
```

**Tail new activity (without replaying history):**

The `/changes` feed is chronological — oldest-first. A bare call
replays the whole pact. Use `?from=head` to get a cursor pinned at
HEAD, then loop with that cursor and a wait window. Extracting the
cursor out of the response needs a tiny JSON read, hence the `jget`
helper defined above.

```bash
# Seed at the current head; no replay.
CURSOR=$(curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/changes?from=head" | jget cursor)

# Loop: block up to 30s for anything new. Survive transient curl
# failures without losing the cursor.
while :; do
  R=$(curl -sf --max-time 35 "${AUTH[@]}" \
      "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/changes?since=$(urlenc "$CURSOR")&wait=30") \
    || { sleep 2; continue; }
  # $R is `{entries: [...], cursor, has_more}`. Parse directly.
  printf '%s\n' "$R"
  NEXT=$(printf '%s' "$R" | jget cursor)
  [[ -n "$NEXT" ]] && CURSOR="$NEXT"
done
```

### Conventions

- **Topics are short and reusable.** `routing`, `auth`, `db-schema`,
  `testing`. Pick from existing topics before inventing a new one —
  `GET /knowledge` returns every entry, and each entry's
  `payload.topic` is a string; glance through them in the response.
- **One fact per entry.** Do not dump a paragraph; record the decision
  and one sentence of reasoning. Future readers can fetch context.
- **Write in markdown.** Knowledge bodies, message content, and skill
  descriptions render as GFM markdown on the dashboard — headings,
  lists, `inline code`, fenced code blocks, links, tables, and
  blockquotes all work. Use it when it helps; plain prose is fine when
  it doesn't.
- **Do not echo the diff.** The pact stores knowledge that is not in
  the code or git history.
- **Check status before assuming the daemon is there:**
  `curl -sf "$OPENPACT_URL/v1/ping"` → `{"ok":true}`.

<!-- END: openpact recipe -->
