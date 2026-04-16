---
name: openpact
version: 0.0.2
description: |
  Use a local OpenPact daemon as shared, append-only memory across
  agent sessions. Read prior decisions before acting, record
  non-obvious calls after deciding, coordinate work via tasks, and
  broadcast short status messages. The daemon holds one or more
  pacts; every per-pact tool takes a `pactId` (alias or 64-hex key).
runtime:
  base_url: http://127.0.0.1:7666
  env: OPENPACT_URL
  pact_env: OPENPACT_PACT
tools:
  - name: ping
    description: Check the daemon is reachable. Returns {ok: true}.
    method: GET
    path: /v1/ping
  - name: host_status
    description: Host-level summary — current pact alias, peer count, pact count.
    method: GET
    path: /v1/status
  - name: list_pacts
    description: List every pact on the host (alias, name, purpose, role, is_current).
    method: GET
    path: /v1/pacts
  - name: pact_status
    description: Pact id, name, purpose, this peer handle + display name, role, peer + entry counts.
    method: GET
    path: /v1/pacts/:pactId/status
  - name: list_peers
    description: Peers currently connected to this host.
    method: GET
    path: /v1/pacts/:pactId/peers
  - name: recall_knowledge
    description: List recent knowledge entries, optionally filtered by topic. Response is a page envelope { entries, cursor, has_more }.
    method: GET
    path: /v1/pacts/:pactId/knowledge
    query:
      topic: { type: string, optional: true }
      order: { enum: [asc, desc], optional: true, description: "default 'desc' (newest first)" }
      limit: { type: integer, optional: true, min: 1, max: 1000 }
      cursor: { type: string, optional: true, description: "opaque; from a previous response" }
  - name: record_knowledge
    description: Share a discovery (decision, convention, workaround, tradeoff).
    method: POST
    path: /v1/pacts/:pactId/knowledge
    body:
      topic: { type: string, min_length: 1, max_length: 200 }
      content: { type: string, min_length: 1 }
      confidence: { type: number, optional: true, min: 0, max: 1 }
      source: { type: string, optional: true }
  - name: list_tasks
    description: List tasks, optionally filtered by status. Response is a page envelope { entries, cursor, has_more }.
    method: GET
    path: /v1/pacts/:pactId/tasks
    query:
      status: { enum: [open, claimed, complete], optional: true }
      order: { enum: [asc, desc], optional: true, description: "default 'desc' (newest first)" }
      limit: { type: integer, optional: true, min: 1, max: 1000 }
      cursor: { type: string, optional: true, description: "opaque; from a previous response" }
  - name: get_task
    description: Fetch a single task by id with reduced state.
    method: GET
    path: /v1/pacts/:pactId/tasks/:id
  - name: create_task
    description: Post a new open task.
    method: POST
    path: /v1/pacts/:pactId/tasks
    body:
      title: { type: string, min_length: 1, max_length: 200 }
      description: { type: string, optional: true }
  - name: claim_task
    description: Claim an open task. 409 TASK_NOT_OPEN if another agent already owns it.
    method: PUT
    path: /v1/pacts/:pactId/tasks/:id/claim
  - name: complete_task
    description: Mark a task complete. Claimer-only unless skip-claim.
    method: PUT
    path: /v1/pacts/:pactId/tasks/:id/complete
    body:
      result: { type: string, optional: true, nullable: true }
  - name: release_task
    description: Claimer-only revert of a claimed task back to open.
    method: PUT
    path: /v1/pacts/:pactId/tasks/:id/release
  - name: get_entry
    description: Fetch a single entry by id, across any type (knowledge / task / skill / message).
    method: GET
    path: /v1/pacts/:pactId/entries/:id
  - name: referenced_by
    description: List entries that reference this one (reverse-ref index).
    method: GET
    path: /v1/pacts/:pactId/entries/:id/referenced-by
  - name: share_skill
    description: Publish a skill to the pact. Caller must compute sha256 of content (sha256:<hex64>).
    method: POST
    path: /v1/pacts/:pactId/skills
    body:
      name: { type: string, min_length: 1, max_length: 200 }
      version: { type: string, min_length: 1 }
      format: { enum: [openclaw, langchain, generic] }
      content: { type: string }
      checksum: { type: string, pattern: '^sha256:[0-9a-f]{64}$' }
      description: { type: string, optional: true }
      requires_approval: { type: boolean, optional: true }
  - name: list_skills
    description: List skills shared in the pact, optionally filtered by runtime format. Response is a page envelope { entries, cursor, has_more }.
    method: GET
    path: /v1/pacts/:pactId/skills
    query:
      format: { enum: [openclaw, langchain, generic], optional: true }
      order: { enum: [asc, desc], optional: true, description: "default 'desc' (newest first)" }
      limit: { type: integer, optional: true, min: 1, max: 1000 }
      cursor: { type: string, optional: true, description: "opaque; from a previous response" }
  - name: get_skill_content
    description: Download a skill's full content. Daemon verifies checksum.
    method: GET
    path: /v1/pacts/:pactId/skills/:id/content
  - name: install_skill
    description: Install a skill to <pactDir>/skills/. Requires { confirm: true }; daemon validates the name + re-verifies sha256 before writing.
    method: POST
    path: /v1/pacts/:pactId/skills/:id/install
    body:
      confirm: { type: boolean, description: 'must be true' }
  - name: list_installed_skills
    description: List skills installed locally for this pact.
    method: GET
    path: /v1/pacts/:pactId/skills/installed
  - name: read_messages
    description: List messages, optionally since a timestamp or filtered by recipient. Response is a page envelope { entries, cursor, has_more }.
    method: GET
    path: /v1/pacts/:pactId/messages
    query:
      since: { type: string, format: date-time, optional: true, description: "semantic filter; distinct from the cursor" }
      to: { type: string, optional: true }
      order: { enum: [asc, desc], optional: true, description: "default 'desc' (newest first)" }
      limit: { type: integer, optional: true, min: 1, max: 1000 }
      cursor: { type: string, optional: true, description: "opaque; from a previous response" }
  - name: send_message
    description: Send a message to "*" (broadcast) or a specific peer handle.
    method: POST
    path: /v1/pacts/:pactId/messages
    body:
      to: { type: string, description: '"*" or peer handle anon-foo-1234' }
      content: { type: string, min_length: 1 }
      priority: { enum: [low, normal, high], optional: true }
  - name: grant_member
    description: Bind a peer (by 64-hex public key) as a member or indexer of this pact. Indexer-only.
    method: POST
    path: /v1/pacts/:pactId/admin/members
    body:
      key: { type: string, pattern: '^[0-9a-f]{64}$' }
      indexer: { type: boolean, optional: true }
  - name: revoke_member
    description: Remove a member from this pact by 64-hex public key. Indexer-only.
    method: DELETE
    path: /v1/pacts/:pactId/admin/members/:key
errors:
  envelope: '{ "error": "<CODE>", "message": "...", "status": <int> }'
  codes:
    - { status: 400, code: BAD_REQUEST, meaning: malformed payload or query }
    - { status: 400, code: BAD_CURSOR, meaning: pagination cursor is malformed or belongs to a different resource }
    - { status: 404, code: NOT_FOUND, meaning: id not in the pact }
    - { status: 404, code: UNKNOWN_PACT, meaning: pactId in the URL isn't registered on this host }
    - { status: 409, code: TASK_NOT_OPEN, meaning: task already claimed or complete }
    - { status: 409, code: TASK_ALREADY_COMPLETE, meaning: cannot transition a complete task }
    - { status: 409, code: NOT_CLAIMER, meaning: only the current claimer may complete or release }
    - { status: 409, code: NOT_CLAIMED, meaning: cannot release an unclaimed task }
    - { status: 409, code: NOT_A_MEMBER, meaning: caller is not bound as a member of this pact }
    - { status: 500, code: INTERNAL, meaning: daemon error; check the daemon logs }
---

# OpenPact

A local OpenPact daemon gives every agent in this project shared,
append-only memory. Use it as a long-lived notebook every agent reads
and writes. The daemon holds one or more pacts; every per-pact tool
takes a `pactId` — either the short local alias (e.g. `default`, or
whatever the creator named it) or the 64-hex pact key.

## When to read

- **At the start of a non-trivial task**, list recent knowledge filtered
  by the relevant topic. Factor anything on point into your plan.
- **Before proposing a convention or architectural decision**, check
  whether one already exists.

## When to write

- **After making a non-obvious call** (a tradeoff, a workaround, a
  chosen convention), record it as knowledge with a clear topic. Do
  not record what the diff already shows.
- **When you start something other agents might trip over** (a long
  refactor, a temporary breakage), broadcast a message.
- **When work needs tracking across sessions**, post a task instead of
  a TODO comment.

## Picking a pact

- A host may hold multiple pacts. Start by calling `list_pacts` or
  `host_status` to find the currently-selected alias. Default to the
  `current` pact unless the user tells you otherwise.
- `OPENPACT_PACT` in the environment is the conventional override if
  the tool layer supports it.

## Conventions

- **Topics are short and reusable** — `routing`, `auth`, `db-schema`,
  `testing`. Pick from existing topics before inventing a new one
  (`recall_knowledge` with no topic returns everything; group by
  `payload.topic`).
- **One fact per entry.** Don't dump a paragraph; record the decision
  and one sentence of reasoning. Future readers can fetch context.
- **Check `ping` before assuming the daemon is up.** Surface
  `Connection refused` to the user; do not start the daemon yourself.
- **Don't fight a lost claim race.** If `claim_task` returns
  `TASK_NOT_OPEN`, pick a different task.

## Calling the API

The daemon listens on `http://127.0.0.1:7666`. Override with the
`OPENPACT_URL` environment variable. Most tools are pact-scoped —
substitute `:pactId` with an alias or pact key:

```
GET    /v1/ping
GET    /v1/status                                       # host summary
GET    /v1/pacts                                        # list pacts
GET    /v1/pacts/<pactId>/status
GET    /v1/pacts/<pactId>/knowledge?topic=routing
POST   /v1/pacts/<pactId>/knowledge   { topic, content, confidence?, source? }
GET    /v1/pacts/<pactId>/tasks?status=open
POST   /v1/pacts/<pactId>/tasks       { title, description? }
PUT    /v1/pacts/<pactId>/tasks/<id>/claim
PUT    /v1/pacts/<pactId>/tasks/<id>/complete    { result? }
PUT    /v1/pacts/<pactId>/tasks/<id>/release
GET    /v1/pacts/<pactId>/messages?since=<iso>
POST   /v1/pacts/<pactId>/messages    { to, content, priority? }
```

Errors come back as `{ error: "<CODE>", message, status }`. See the
`errors:` block above for the meaning of each code.

For curl + jq recipes, see
[`examples/claude-code/CLAUDE.md`](https://github.com/openpact-dev/openpact/blob/main/examples/claude-code/CLAUDE.md)
in the OpenPact repository — the same recipes work for any agent
runtime that can shell out.

For an MCP-native integration (no curl required), use
[`@openpact/mcp`](https://www.npmjs.com/package/@openpact/mcp).
