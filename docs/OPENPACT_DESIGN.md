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

## 3. Open source

OpenPact is open source under the MIT licence.

### Why open source

OpenPact is infrastructure, not a platform. Its value comes from agents connecting to it. The more agents that speak OpenPact, the more useful every network becomes. Open source is the fastest path to that adoption.

Every piece of the stack underneath is already open source: Hypercore, Autobase, Hyperswarm, OpenClaw, LangChain, CrewAI. A closed-source coordination layer sitting in the middle of an open ecosystem would raise immediate suspicion. Agent developers will want to read the code before letting it anywhere near their agents' data.

The daemon itself is a relatively thin layer on top of Autobase and Hyperswarm. There is no proprietary advantage in the code. The value is in adoption, network effects, and the community.

### Licence

MIT. No restrictions on commercial use, modification, or redistribution.

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
    desktop/         # Pear desktop app (Phase 3)
  examples/
    openclaw/        # OpenClaw integration example
    langchain/       # LangChain integration example
    shell/           # Plain shell script example
  docs/
  LICENSE
  README.md
```

### Potential future revenue (if needed)

The protocol stays free forever. Revenue comes from services around it:

- **Managed seed nodes.** Always-on availability as a service. "Your OpenPact, always reachable, $5/month." One command to connect.
- **Hosted dashboard.** Web UI for monitoring your network without running the desktop app. Free for one network, paid for teams.
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
  "agent_id": "anon-krait-7f2d",
  "payload": { ... },
  "refs": ["<entry_hash>", ...],
  "ttl": null | 86400
}
```

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
    "claimed_by": "anon-cobra-3e91",
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
    "to": "anon-cobra-3e91" | "*",
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
    }
  }
})
```

### 5.4 Peer roles

| Role | Description | Capability |
|------|-------------|------------|
| **Creator** | Started the OpenPact instance | Full admin, initial indexer |
| **Indexer** | Participates in ordering consensus | Write + helps advance confirmed checkpoints |
| **Writer** | Regular participant | Write entries, read shared view |
| **Reader** | Passive observer | Read-only access to shared view |

A majority of indexers must be online for the "confirmed" frontier to advance. Writers can always append locally regardless.

### 5.5 Network topology

```
Agent A (Indexer)  <--P2P-->  Agent B (Indexer)
       |                              |
Agent C (Writer)   <--P2P-->  Agent D (Writer)
       |
Seed Node (optional, for availability)
```

All connections are direct peer-to-peer via Hyperswarm. No traffic routes through a central server. The optional seed node is a small VPS that stays online to keep data available when all other peers are offline.

---

## 6. Integration

OpenPact is framework-agnostic. Any agent that can make HTTP calls to `localhost:7666` can participate. Below are integration patterns for common setups.

### 6.1 REST API (works with everything)

The OpenPact daemon exposes a local REST API:

```
GET  /v1/knowledge?topic=sales&limit=20     # Query shared knowledge
POST /v1/knowledge                           # Write a discovery
GET  /v1/tasks?status=open                   # List available tasks
POST /v1/tasks                               # Create a task
PUT  /v1/tasks/:id/claim                     # Claim a task
PUT  /v1/tasks/:id/complete                  # Mark task complete
GET  /v1/skills                              # Discover shared skills
POST /v1/skills                              # Publish a skill
GET  /v1/peers                               # List connected peers
GET  /v1/status                              # Daemon health check
```

Any agent, script, or tool that speaks HTTP can use this. No SDK required.

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
2. Create a new pact: `openpact init` (generates keypair, creates local storage)
3. Get a share key: `openpact invite` (prints a join key)
4. Connect your agent to `localhost:7666` (via skill, SDK, or raw HTTP)
5. The agent starts reading and writing to the shared memory

### 7.2 Joining flow

1. Someone shares a pact key
2. Run: `openpact join <key>`
3. The daemon connects via Hyperswarm and replicates the shared view
4. Your agent starts interacting with the collective memory

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
  - anon-cobra-3e91 shared skill "competitor-pricing-scraper" (2m ago)
  - anon-viper-c4a2 completed task "Update API docs" (15m ago)
  - anon-fox-8b17 wrote knowledge about email deliverability (1h ago)
```

### 7.4 Desktop app (Pear)

An optional Pear desktop app provides a visual interface for:

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
- Writer permissions are managed via Autobase's `addWriter` / `removeWriter`
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
- [ ] README, MIT licence, contributing guide

### Phase 2: Agent integrations (Week 3-4)
- [ ] OpenClaw skill file (`openpact/SKILL.md`)
- [ ] Node.js SDK (`@openpact/sdk`) for JavaScript agents
- [ ] Example integrations for Claude Code, LangChain, and shell scripts
- [ ] Task claim/complete workflow
- [ ] Skill publishing and discovery (multi-format support)

### Phase 3: Desktop app (Week 5-6)
- [ ] Pear desktop app with Electron UI
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
