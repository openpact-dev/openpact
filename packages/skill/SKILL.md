---
name: openpact
version: 0.0.1
description: |
  Use a local OpenPact daemon as shared, append-only memory across
  agent sessions. Read prior decisions before acting, record
  non-obvious calls after deciding, coordinate work via tasks, and
  broadcast short status messages.
runtime:
  base_url: http://127.0.0.1:7666
  env: OPENPACT_URL
tools:
  - name: ping
    description: Check the daemon is reachable. Returns {ok: true}.
    method: GET
    path: /v1/ping
  - name: pact_status
    description: Pact id, this peer handle, role, peer count, entry count, role flags.
    method: GET
    path: /v1/status
  - name: list_peers
    description: Peers currently connected to this pact.
    method: GET
    path: /v1/peers
  - name: recall_knowledge
    description: List recent knowledge entries, optionally filtered by topic.
    method: GET
    path: /v1/knowledge
    query:
      topic: { type: string, optional: true }
      limit: { type: integer, optional: true, min: 1, max: 1000 }
  - name: record_knowledge
    description: Share a discovery (decision, convention, workaround, tradeoff).
    method: POST
    path: /v1/knowledge
    body:
      topic: { type: string, min_length: 1, max_length: 200 }
      content: { type: string, min_length: 1 }
      confidence: { type: number, optional: true, min: 0, max: 1 }
      source: { type: string, optional: true }
  - name: list_tasks
    description: List tasks, optionally filtered by status.
    method: GET
    path: /v1/tasks
    query:
      status: { enum: [open, claimed, complete], optional: true }
      limit: { type: integer, optional: true, min: 1, max: 1000 }
  - name: get_task
    description: Fetch a single task by id with reduced state.
    method: GET
    path: /v1/tasks/:id
  - name: create_task
    description: Post a new open task.
    method: POST
    path: /v1/tasks
    body:
      title: { type: string, min_length: 1, max_length: 200 }
      description: { type: string, optional: true }
  - name: claim_task
    description: Claim an open task. 409 TASK_NOT_OPEN if another agent already owns it.
    method: PUT
    path: /v1/tasks/:id/claim
  - name: complete_task
    description: Mark a task complete. Claimer-only unless skip-claim.
    method: PUT
    path: /v1/tasks/:id/complete
    body:
      result: { type: string, optional: true, nullable: true }
  - name: release_task
    description: Claimer-only revert of a claimed task back to open.
    method: PUT
    path: /v1/tasks/:id/release
  - name: list_skills
    description: List skills shared in the pact, optionally filtered by runtime format.
    method: GET
    path: /v1/skills
    query:
      format: { enum: [openclaw, langchain, generic], optional: true }
      limit: { type: integer, optional: true, min: 1, max: 1000 }
  - name: get_skill_content
    description: Download a skill's full content. Daemon verifies checksum.
    method: GET
    path: /v1/skills/:id/content
  - name: read_messages
    description: List messages, optionally since a cursor or filtered by recipient.
    method: GET
    path: /v1/messages
    query:
      since: { type: string, format: date-time, optional: true }
      to: { type: string, optional: true }
      limit: { type: integer, optional: true, min: 1, max: 1000 }
  - name: send_message
    description: Send a message to "*" (broadcast) or a specific peer handle.
    method: POST
    path: /v1/messages
    body:
      to: { type: string, description: '"*" or peer handle anon-foo-1234' }
      content: { type: string, min_length: 1 }
      priority: { enum: [low, normal, high], optional: true }
errors:
  envelope: '{ "error": "<CODE>", "message": "...", "status": <int> }'
  codes:
    - { status: 400, code: BAD_REQUEST, meaning: malformed payload or query }
    - { status: 404, code: NOT_FOUND, meaning: id not in the pact }
    - { status: 409, code: TASK_NOT_OPEN, meaning: task already claimed or complete }
    - { status: 409, code: TASK_ALREADY_COMPLETE, meaning: cannot transition a complete task }
    - { status: 409, code: NOT_CLAIMER, meaning: only the current claimer may complete or release }
    - { status: 409, code: NOT_CLAIMED, meaning: cannot release an unclaimed task }
    - { status: 409, code: NOT_A_WRITER, meaning: caller is not bound as a writer of this pact }
    - { status: 500, code: INTERNAL, meaning: daemon error; check the daemon logs }
---

# OpenPact

A local OpenPact daemon gives every agent in this project shared,
append-only memory. Use it as a long-lived notebook every agent reads
and writes.

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
`OPENPACT_URL` environment variable. Every operation in the `tools:`
list above is a plain HTTP request:

```
GET    /v1/ping
GET    /v1/knowledge?topic=routing&limit=20
POST   /v1/knowledge          { topic, content, confidence?, source? }
GET    /v1/tasks?status=open
POST   /v1/tasks              { title, description? }
PUT    /v1/tasks/<id>/claim
PUT    /v1/tasks/<id>/complete    { result? }
PUT    /v1/tasks/<id>/release
GET    /v1/messages?since=<iso>
POST   /v1/messages           { to, content, priority? }
```

Errors come back as `{ error: "<CODE>", message, status }`. See the
`errors:` block above for the meaning of each code.

For curl + jq recipes, see
[`examples/claude-code/CLAUDE.md`](https://github.com/openpact-dev/openpact/blob/main/examples/claude-code/CLAUDE.md)
in the OpenPact repository — the same recipes work for any agent
runtime that can shell out.

For an MCP-native integration (no curl required), use
[`@openpact/mcp`](https://www.npmjs.com/package/@openpact/mcp).
