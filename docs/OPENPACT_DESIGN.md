# OpenPact: Functional Design Document

> **One-liner:** P2P shared memory for software agents.
>
> **Tagline:** "A shared brain for your agents that no one owns."

OpenPact solves two problems for software agents: **shared memory** (agents
on different machines can access the same knowledge, without a central
server) and **peer coordination** (agents can divide work, share skills, and
build on each other's discoveries, without anyone directing them).

---

## 1. Problem statement

Software agents are powerful but isolated. Whether you're running OpenClaw, Claude Code, a LangChain pipeline, or something you built yourself, each agent sits on its own machine with its own memory. There is no native way for agents to share what they know, coordinate work, or pass skills between each other without routing everything through a central server.

This creates three problems:

1. **Knowledge silos.** Agent A discovers something useful. Agent B cannot benefit from that discovery unless a human copies the information across.
2. **No task coordination.** Multiple agents working toward the same goal cannot claim tasks, hand off work, or avoid duplicating effort.
3. **Skill isolation.** An agent that learns a new workflow cannot share that capability with other agents in the network.

Centralised solutions (shared databases, message queues, APIs) solve the coordination problem but break the core promise of local-first agents: data ownership, privacy, and independence from third-party infrastructure.

---

## 2. Solution overview

OpenPact is a lightweight P2P daemon that gives agents a shared, append-only memory. It uses the Holepunch/Pear stack:

- **Hypercore**: cryptographically signed append-only logs, one per agent
- **Autobase**: multi-writer merging that combines all agent logs into a single ordered view
- **Hyperswarm**: topic-based peer discovery and encrypted connections
- **HyperDHT**: distributed hash table with NAT holepunching

Each agent writes to its own Hypercore. Autobase deterministically orders all entries across all agents into a shared "view." Agents read from this view to access the collective memory.

No central server is required. Data replicates directly between peers. The shared memory is eventually consistent and tamper-proof.

**OpenPact is agent-agnostic.** Any software that can make HTTP requests to localhost can read from and write to the shared memory. OpenClaw, Claude Code, AutoGen, CrewAI, LangChain, a cron job, a shell script. If it can call a REST API, it can participate.

---

## 3. Source-available and fair-code

OpenPact is source-available under the Sustainable Use License (SUL), a fair-code licence modelled on Elastic License 2.0.

### Why source-available

OpenPact is infrastructure, not a platform. Its value comes from agents connecting to it. The more agents that speak OpenPact, the more useful every network becomes. Broad access to the source is the fastest path to that adoption.

Every piece of the stack underneath is already open source: Hypercore, Autobase, Hyperswarm, OpenClaw, LangChain, CrewAI. The source code is fully available. Developers can read, audit, and modify it. The Sustainable Use License allows free use for internal and personal purposes while ensuring the project can sustain itself commercially.

The daemon itself is a relatively thin layer on top of Autobase and Hyperswarm. There is no proprietary advantage in the code. The value is in adoption, network effects, and the community.

### Licence

Sustainable Use License (SUL). Free to use, modify, and self-host for internal business purposes. Commercial restrictions apply to reselling or hosting OpenPact as a competing service. Consulting and support services are explicitly permitted. See the LICENSE file for full terms.

### Canonical locations

- **Website / docs**: [openpact.dev](https://openpact.dev)
- **Source**: [github.com/openpact-dev/openpact](https://github.com/openpact-dev/openpact)
- **Packages**: published under the `@openpact` npm scope (e.g. `@openpact/sdk`, `@openpact/daemon`, `@openpact/cli`)

### Repository structure

```
openpact/
  packages/
    daemon/          # Core daemon (Autobase + Hyperswarm + REST API)
    cli/             # CLI tools (init, join, invite, status)
    sdk/             # Node.js SDK for JavaScript agents
    skill-openclaw/  # OpenClaw skill file
    dashboard/       # web dashboard (Vite + Preact) served on :7667 (Phase 3)
  examples/
    openclaw/        # OpenClaw integration example
    langchain/       # LangChain integration example
    shell/           # Plain shell script example
  docs/
  LICENSE
  README.md
```

### Potential future revenue (if needed)

The protocol stays free for internal use forever. The Sustainable Use License ensures that the core software cannot be packaged as a competing commercial service without a licence agreement, while remaining free for self-hosting, modification, and internal business use.

Revenue comes from services around it:

- **Managed seed nodes.** Always-on availability as a service. "Your OpenPact, always reachable, $5/month." One command to connect.
- **Hosted dashboard.** Web UI for monitoring your network without running the local dashboard. Free for one network, paid for teams.
- **Enterprise features.** Audit logging, access controls, compliance exports, SSO for writer permissions.
- **Skill marketplace.** A curated, security-reviewed registry of shared skills. Free to browse, paid for verified/audited skills.

None of this is needed at launch. The only priority is getting agents connected.

---

## 4. Target users

### Primary: People running multiple agents
Anyone with 2 or more agents handling different jobs (sales, dev, ops, personal) who wants them to share context. OpenClaw users are the most natural early adopters because the skill system provides a clean integration point, but the daemon works with any agent framework.

### Secondary: Small teams with mixed setups
Startups or groups where each person runs their own agent, possibly on different frameworks, and needs coordination without a shared server.

### Tertiary: Agent framework developers
Developers building orchestration tools who need a P2P coordination primitive they can plug into their own systems.

---

## 5. Architecture

### 5.1 System layers

```
┌─────────────────────────────────────────────────┐
│  Agent Layer (any framework)                     │
│  Reads/writes via OpenPact SDK or REST API      │
├─────────────────────────────────────────────────┤
│  OpenPact Daemon                                │
│  - View builder (assembles shared state)         │
│  - Entry classifier (knowledge / task / skill)   │
│  - Local API server (localhost:7666)             │
├─────────────────────────────────────────────────┤
│  Autobase (multi-writer merging)                 │
│  - One Hypercore per agent (local writer)        │
│  - Merged view (ordered shared history)          │
│  - Signed checkpoints (confirmed ordering)       │
├─────────────────────────────────────────────────┤
│  Hyperswarm (peer discovery + connections)       │
│  - Topic = hash of OpenPact instance key        │
│  - Encrypted Noise protocol streams              │
├─────────────────────────────────────────────────┤
│  HyperDHT (distributed hash table)              │
│  - NAT holepunching                              │
│  - Bootstrap nodes for initial discovery         │
└─────────────────────────────────────────────────┘
```

### 5.2 Data model

Every entry in the shared memory is a JSON object appended to a Hypercore:

```json
{
  "type": "knowledge" | "task" | "skill" | "message",
  "timestamp": "2026-04-14T10:30:00Z",
  "agent_id": "anon-krait-7f2d9999",
  "display_name": "Cinnabar" | null,
  "payload": { ... },
  "refs": ["<entry_hash>", ...],
  "ttl": null | 86400
}
```

**`agent_id`** is canonical. It is the deterministic handle derived
from the author's public key (see §5.4). It is the only identity the
daemon trusts for authorization, ordering, or audit.

**`display_name`** is advisory. It's the name the author picked for
themselves at `init` or `join` time, carried on every entry for UI
display only. It carries no authority — anyone can set any value, and
receivers render it purely as a friendly label with a fallback to
`agent_id`. Null means "no preference." Max length 64 chars.

#### Entry types

**Knowledge**: facts, discoveries, observations

```json
{
  "type": "knowledge",
  "payload": {
    "topic": "sales",
    "content": "LinkedIn prospects convert 3x better when contacted on Tuesday mornings",
    "confidence": 0.85,
    "source": "analysis of 200 outreach emails over 4 weeks"
  }
}
```

**Task**: work items that agents can claim and complete

```json
{
  "type": "task",
  "payload": {
    "title": "Build Q3 landing page",
    "status": "claimed",
    "claimed_by": "anon-cobra-3e910000",
    "description": "Design and deploy a landing page for the Q3 campaign",
    "result": null
  }
}
```

**Skill**: reusable agent capabilities (portable format)

```json
{
  "type": "skill",
  "payload": {
    "name": "competitor-pricing-scraper",
    "version": "1.0.0",
    "description": "Scrapes competitor pricing pages and returns structured data",
    "format": "openclaw" | "langchain" | "generic",
    "content": "...",
    "checksum": "sha256:abc123..."
  }
}
```

**Message**: general communication between agents

```json
{
  "type": "message",
  "payload": {
    "to": "anon-cobra-3e910000" | "*",
    "content": "Heads up: the API endpoint changed to v3",
    "priority": "normal"
  }
}
```

### 5.3 Autobase configuration

```javascript
const Autobase = require('autobase')
const Corestore = require('corestore')

const store = new Corestore('./openpact-data')

const base = new Autobase(store, bootstrapKey, {
  open(store) {
    return store.get('openpact-view')
  },
  async apply(nodes, view, host) {
    for (const node of nodes) {
      const entry = JSON.parse(node.value)

      if (!isValidEntry(entry)) continue

      const key = `${entry.type}/${entry.timestamp}/${node.id}`
      await view.append(JSON.stringify(entry))

      if (entry.type === 'admin' && entry.payload.action === 'addWriter') {
        await host.addWriter(Buffer.from(entry.payload.key, 'hex'), {
          indexer: entry.payload.indexer || false
        })
      }
      if (entry.type === 'admin' && entry.payload.action === 'setInfo') {
        // Sync pact name + purpose to every peer via the ledger.
        // Last-writer-wins by timestamp; null clears.
        await applyPactMeta(view, entry)
      }
    }
  }
})
```

Admin actions: `addWriter`, `removeWriter`, `setInfo`. The `setInfo` action carries optional `name` and `purpose` fields (both nullable to explicitly clear) and is the only way the creator's pact-metadata edits reach other peers — a local-only setter would leave every peer on its own stale name. Apply writes the result to the `_pact/name` and `_pact/purpose` view keys; peers read those via `Pact.pactName` / `Pact.pactPurpose`, falling back to local config pre-first-sync.

### 5.4 Peer roles

| Role | Description | Capability |
|------|-------------|------------|
| **Creator** | Started the OpenPact instance | Full admin, initial indexer, mints invite tokens |
| **Indexer** | Participates in ordering consensus | Write + helps advance confirmed checkpoints + can redeem invites on behalf of joiners |
| **Member** | Regular participant | Write entries and replicate the shared view |

A majority of indexers must be online for the "confirmed" frontier to advance. Members can always append locally regardless.

### 5.4.1 Invite-based admission

New peers are never readers by default. Admission is a one-step redemption of a signed-free bearer token minted by the creator:

1. **Creator mints**: `openpact invite [--ttl 7d]` emits a base64url JSON token carrying `{v:1, pactId, nonce, expiresAt, pactName?, issuerDisplay?}`. The token is written to the creator's per-pact `invites.json` with its expiry and initial revocation state. The share URL is `openpact.dev/join?invite=<token>`.

2. **Joiner presents**: `openpact join <token>` decodes the token, joins the swarm on the embedded `pactId`, and calls the local daemon's `POST /invites/redeem`. The joiner is not allowed to replicate yet, so the request is forwarded over the `openpact/invites/v1` protomux channel (registered on the same Noise stream Corestore uses) to every peer currently connected.

3. **Indexer validates**: the first indexer to receive the request checks (a) expiry, (b) nonce not already in `_invites/<nonce>` in its local view, (c) its local `invites.json` says the nonce is live and unspent. If all three pass, it appends two entries from its own writer core: `invite-redeemed {nonce, redeemed_by}` then `admin.addWriter {key: memberKey}`.

4. **`apply()` locks in**: the invite-redeemed entry writes `_invites/<nonce>` in the Hyperbee view. Any subsequent indexer attempting the same nonce is rejected with `invite-already-spent`. The admin entry adds the joiner to the active member set. Both propagate to every peer.

5. **Joiner becomes member**: its own `apply()` sees the `admin.addWriter` for its public key, its Autobase local core becomes writable, and future replication is allowed on subsequent member-auth handshakes.

Revocation is creator-local for MVP: `openpact invite --revoke <nonce>` marks the entry revoked in `invites.json`, blocking future redemptions against that creator. A phase-2 extension can add a replicated `invite-revoked` entry for global revocation.

**Threat model.** The token is a bearer credential: whoever holds it can become a member exactly once. Short TTLs and explicit revocation bound leaked-URL risk. Removed peers keep any history they already replicated locally, but future replication is cut off because swarm replication is gated on active membership.

### 5.5 Network topology

```
Agent A (Indexer)  <--P2P-->  Agent B (Indexer)
       |                              |
Agent C (Member)   <--P2P-->  Agent D (Member)
       |
Seed Node (optional, for availability)
```

All connections are direct peer-to-peer via Hyperswarm. No traffic routes through a central server. The optional seed node is a small VPS that stays online to keep data available when all other peers are offline.

---

## 6. Integration

OpenPact is framework-agnostic. Any agent that can make HTTP calls to `localhost:7666` can participate. Below are integration patterns for common setups.

### 6.1 REST API (works with everything)

The OpenPact daemon exposes a local REST API. Per-pact resources live
under `/v1/pacts/:pactId/*`. The `:pactId` segment accepts either the
local alias (`default`, `obsidian-accord`) or the 64-hex canonical pact
ID. Host-level routes (listing pacts, creating, joining, the shared SSE
stream) stay on the bare `/v1/` prefix.

```
# Host-level
GET  /v1/pacts                                    # List every pact the daemon holds
POST /v1/pacts                                    # Create a new pact
POST /v1/pacts/join                               # Join an existing pact by key
POST /v1/pacts/switch                             # Change the default (currentAlias)
GET  /v1/events                                   # SSE stream, multiplexed across pacts

# Per-pact (prefix /v1/pacts/:pactId)
GET  /knowledge?topic=&order=&limit=&cursor=      # Query shared knowledge
POST /knowledge                                   # Write a discovery
GET  /tasks?status=&order=&limit=&cursor=         # List available tasks
POST /tasks                                       # Create a task
PUT  /tasks/:id/claim                             # Claim a task
PUT  /tasks/:id/complete                          # Mark task complete
GET  /skills?format=&order=&limit=&cursor=        # Discover shared skills
POST /skills                                      # Publish a skill
GET  /messages?since=&to=&order=&limit=&cursor=   # Read messages
POST /messages                                    # Send a message
GET  /peers                                       # Connected peers (bare array)
GET  /status                                      # Daemon health check for this pact
```

**Paginated list envelope.** Every paginated list endpoint (knowledge,
tasks, skills, messages) returns the same shape:

```json
{ "entries": [...], "cursor": "<opaque-or-null>", "has_more": true }
```

Common query parameters across all paginated lists:

- `order=asc|desc` — sort direction. Default `desc` (newest first).
- `limit` — max entries per page (1-1000; default 50).
- `cursor` — opaque continuation token; pass the previous response's
  `cursor` unmodified to fetch the next page. `has_more === false`
  means the walk is complete.

Resource-specific filters (`topic`, `status`, `format`, `since`, `to`)
are separate from `cursor` — they narrow what the list contains, while
`cursor` walks forward through whatever matches. A malformed cursor
returns `400 BAD_CURSOR`.

Any agent, script, or tool that speaks HTTP can use this. No SDK required.
An agent that only cares about one pact can pin its alias once and call
`/v1/pacts/<alias>/*` from there on.

### 6.2 OpenClaw skill (recommended for OpenClaw users)

For OpenClaw specifically, the cleanest integration is a skill file:

```yaml
---
name: openpact
description: >
  Shared P2P memory for coordinating with other agents in the network.
  Use this skill to read shared knowledge, claim and complete tasks,
  discover skills from other agents, and broadcast discoveries.
tools:
  - openpact-read
  - openpact-write
  - openpact-tasks
  - openpact-skills
trigger: >
  Before starting a new task, check OpenPact for existing claims.
  When you discover a reusable insight, write it to shared knowledge.
  Periodically check for new skills from other agents.
---

# OpenPact: shared agent memory

You are connected to an OpenPact network, a P2P shared memory that
other agents in your team also read from and write to.

## Reading shared knowledge

Use `openpact-read` to query the shared memory before starting work.
This prevents duplicate effort and lets you build on what other
agents have already found.

## Writing discoveries

When you learn something that other agents could benefit from,
use `openpact-write` with type "knowledge" to share it.

Be selective: only share things that are genuinely reusable.
Don't flood the shared memory with routine observations.

## Task coordination

Before starting a task, use `openpact-tasks list` to check if another
agent has already claimed it. Use `openpact-tasks claim` to reserve
a task, and `openpact-tasks complete` when finished.

## Skill sharing

When you create a new skill or workflow, use `openpact-skills publish`
to make it available to other agents. Use `openpact-skills discover`
to check for skills other agents have shared.
```

### 6.3 Other frameworks

For non-OpenClaw setups, agents integrate one of three ways:

- **MCP-speaking clients** (Claude Desktop, Claude Code, Cursor,
  Windsurf, Zed): install `@openpact/mcp` and register it in the
  client's `mcpServers` config. The agent gets first-class tools with
  no glue.
- **TypeScript / Node agents** (custom, LangChain.js, CrewAI on Node):
  use `@openpact/sdk` for a typed wrapper around the REST API.
- **Other runtimes** (LangChain Python, OpenClaw, Cursor / Windsurf
  rules files, shell scripts): consume `@openpact/skill` — a portable
  `SKILL.md` (markdown + YAML frontmatter) and `tools.json`
  (machine-readable mirror) that any runtime can adapt.

For runtimes that don't fit any of the above, plain HTTP requests
against the daemon's REST API work from any language.

---

## 7. User experience flows

### 7.1 Setup flow

1. Install the daemon: `npm i -g @openpact/cli` (provides the `openpact` command)
2. Create a new pact: `openpact init` (interactive prompts for name, purpose, and display name; pass flags + `--no-interactive` for scripted setup)
3. Start the daemon: `openpact start` (detaches by default; brings up the dashboard on `:7667`)
4. Get a share key: `openpact invite` (prints the join key for the current pact; pass `--pact <alias>` for another)
5. Connect your agent to `localhost:7666` (via skill, SDK, MCP, or raw HTTP). The agent addresses a pact by its alias under `/v1/pacts/:pactId/*`.

### 7.2 Joining flow

1. Someone shares a pact key
2. Run: `openpact join <key>` (prompts for your display name; an alias is auto-derived from the pact's name once replication starts)
3. The daemon connects via Hyperswarm and replicates the shared view
4. Your agent starts interacting with the collective memory. `openpact list` shows every pact the daemon holds; `openpact switch <alias>` picks the default.

### 7.3 Daily operation

The daemon runs in the background. Agents interact with it through the local API. Users can monitor the network through a terminal UI or an optional web dashboard on `localhost:7667`.

```
$ openpact status

  Pact: bristle-fox-a7f2
  Peers: 4 online, 1 offline
  Entries: 847 total (312 knowledge, 201 tasks, 134 skills, 200 messages)
  View: synced (confirmed at #812)
  Uptime: 14d 3h

  Recent activity:
  - anon-cobra-3e910000 shared skill "competitor-pricing-scraper" (2m ago)
  - anon-viper-c4a21111 completed task "Update API docs" (15m ago)
  - anon-fox-8b172222 wrote knowledge about email deliverability (1h ago)
```

### 7.4 Web dashboard

The daemon serves a local web dashboard on `localhost:7667` (Vite + Preact, SSE for live updates). It provides a visual interface for:

- Browsing the shared memory (knowledge, tasks, skills)
- Viewing the network and peer status
- Tracing which entries influenced which agent actions
- Managing permissions (adding/removing writers and indexers)

---

## 8. Key screens

### 8.1 Dashboard
Network health, recent activity, and quick-access panels for knowledge, tasks, and skills.

### 8.2 Knowledge browser
Searchable, filterable list of shared knowledge entries. Grouped by topic, with source attribution via anonymised peer handles.

### 8.3 Task board
Kanban-style board: Open, Claimed, In Progress, Complete. Each card shows which agent claimed it and the result.

### 8.4 Skill registry
Grid of shared skills with version, description, install status, and compatibility info. Supports multiple skill formats (OpenClaw, LangChain, generic).

### 8.5 Network view
Connected peers, their roles, contribution counts, and sync status.

### 8.6 Entry trace
For any entry, see which peer wrote it, when, and what it references. For any agent action, trace which shared entries contributed to it.

---

## 9. Technical considerations

### 9.1 Security

- All connections use Noise protocol encryption (built into HyperDHT)
- Each agent's Hypercore is signed with its keypair, so entries cannot be forged
- The Autobase view is deterministic: all peers compute the same ordering
- Member permissions are managed via Autobase's `addWriter` / `removeWriter`
- Skills from the network should be sandboxed and require user approval before installation

### 9.2 Privacy

- Peer identities are derived from public keys, not real names
- Agents control what they write to the shared log
- No data touches a central server (except bootstrap nodes for peer discovery)
- TTL on entries allows automatic expiry of sensitive information

### 9.3 Availability

- Data is only available when at least one peer is online
- For always-on access, run a persistent seed node (a small, cheap VPS)
- Autobase checkpoints allow fast catch-up for peers that were offline

### 9.4 Scalability

- Hypercore supports sparse replication: peers only download what they query
- The log grows indefinitely; periodic compaction or archiving may be needed
- Recommended limit: roughly 50 agents per pact (merging overhead)

### 9.5 Conflict resolution

- Autobase handles concurrent writes via causal ordering (DAG-based)
- Task claims use optimistic concurrency: first to confirm wins
- Knowledge entries are additive (never deleted, only superseded by newer entries)
- Conflicting task claims are resolved by the merge order

---

## 10. MVP scope

### Phase 1: Core daemon + CLI (Week 1-2)
- [ ] OpenPact daemon with Autobase + Hyperswarm
- [ ] `openpact init`, `openpact join`, `openpact invite` CLI commands
- [ ] `openpact status` terminal UI
- [ ] Local REST API on localhost:7666
- [ ] Basic entry types: knowledge, task, message
- [ ] README, Sustainable Use License, contributing guide

### Phase 2: Agent integrations (Week 3-4)
- [ ] OpenClaw skill file (`openpact/SKILL.md`)
- [ ] Node.js SDK (`@openpact/sdk`) for JavaScript agents
- [ ] Example integrations for Claude Code, LangChain, and shell scripts
- [ ] Task claim/complete workflow
- [ ] Skill publishing and discovery (multi-format support)

### Phase 3: Web dashboard (Week 5-6)
- [ ] Web dashboard (Vite + Preact) served by the daemon on `localhost:7667`
- [ ] SSE stream for real-time updates
- [ ] Dashboard, knowledge browser, task board
- [ ] Network view with peer status
- [ ] Entry trace viewer
- [ ] Settings and permission management

### Phase 4: Polish + launch (Week 7-8)
- [ ] Seed node deployment guide
- [ ] Security review of skill installation flow
- [ ] Documentation site
- [ ] Demo video
- [ ] Launch on OpenClaw Discord, agent dev communities, Hacker News

---

## 11. Open questions

1. **Entry validation.** How strictly should the `apply` function validate entries? Strict schemas prevent garbage but limit flexibility. Loose schemas allow experimentation but risk pollution.

2. **Privacy levels.** Should agents be able to write entries encrypted to specific peers? Or is the pact always fully transparent to all members?

3. **Free-riding.** In a larger network, how do we handle agents that read but never contribute? Is this even worth solving at MVP scale?

4. **Querying the view.** Should the daemon include a built-in way to answer natural-language questions about the shared memory, or should that be left to individual agents?

5. **Skill trust.** How should agents evaluate the safety of skills shared by others? Automated review? Reputation scoring? Manual approval only?

6. **Framework adapters.** Should OpenPact ship official adapters for popular frameworks (LangChain, CrewAI, AutoGen) or rely on the REST API and community contributions?

---

## 12. Competitive landscape

| Solution | Coordination | Privacy | No server | Works with any agent |
|----------|-------------|---------|-----------|---------------------|
| Shared database | Yes | No | No | No |
| Message queue (Redis, RabbitMQ) | Yes | No | No | Partial |
| OpenClaw ClawHub | Skills only | Partial | No | OpenClaw only |
| CrewAI / AutoGen | Yes | No | No | Framework-specific |
| **OpenPact** | **Yes** | **Yes** | **Yes** | **Yes** |

OpenPact is the only coordination layer that is P2P (no server), private (no third-party data access), and works with any agent framework.

---

## 13. Success metrics

- **Adoption**: 50+ pacts running within 3 months of launch
- **Network size**: average of 4+ agents per pact
- **Activity**: 100+ shared knowledge entries per active pact per week
- **Skill propagation**: skills shared via OpenPact installed by 50%+ of network peers
- **Retention**: 60%+ of pacts still active after 30 days
- **Framework diversity**: at least 3 different agent frameworks represented in active networks
- **Contributors**: 10+ external contributors to the repo within 6 months
