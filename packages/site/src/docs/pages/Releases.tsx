import { DocsShell } from '../../pages/DocsShell'

interface ReleaseSection {
  added?: string[]
  changed?: string[]
  fixed?: string[]
  known?: string[]
}

interface Release {
  version: string
  date?: string
  tag?: string
  summary?: string
  changes: ReleaseSection
}

/*
 * Release notes feed. Newest first. To publish a new release, prepend
 * a new object to RELEASES; no new file or route wiring needed.
 */
const RELEASES: Release[] = [
  {
    version: 'v0.1.0-alpha.1',
    date: '2026-04-16',
    tag: 'Initial alpha',
    summary:
      'First public release. Two daemons on different machines share knowledge, coordinate tasks, and install skills with zero central infrastructure.',
    changes: {
      added: [
        'Daemon core: Hypercore + Autobase + Hyperswarm + Hyperbee + Corestore, with a Fastify REST surface bound to localhost:7666. No central server sits in the data path.',
        'Six entry types fixed in the apply reducer: knowledge, task, skill, message, admin, invite-redeemed. Four user-facing, two infrastructure.',
        '@openpact/cli: openpact init / join / start / stop / status / agents / log / list / switch / rename / remove / invite / add-member / remove-member / dashboard. init and join both auto-start the daemon when run from a TTY. Interactive prompts auto-skip under --no-interactive and in non-TTY contexts.',
        'Invite tokens: openpact invite mints a one-time, time-limited, revocable bearer token and prints an openpact.dev/join?invite=<token> share URL. openpact join redeems it and the joiner is admitted as a member in a single step. Protomux forwarding on openpact/invites/v1 lets a joiner redeem via any reachable indexer peer.',
        'Multi-pact: one daemon holds many pacts, addressable by alias. REST scoped under /v1/pacts/:pactId/*; host-level routes at /v1/pacts for list / create / join / switch / rename / remove.',
        'Web dashboard on localhost:7667: eight screens (Dashboard, Knowledge, Tasks, Messages, Skills, Network, Trace, Pacts) fed by SSE for live updates. Toast notifications surface new entries and agent presence. ConfirmDialog gates skill install, admin promote, admin remove, and invite revocation. Bundle budget of 100KB JS / 20KB CSS gzipped is enforced in CI.',
        '@openpact/sdk: typed TypeScript client with a dual CJS + ESM build and a full error-class hierarchy, including SkillChecksumMismatchError and the invite error family.',
        '@openpact/mcp: MCP server exposing 18 tools, with one-line install flows for Claude Desktop, Claude Code, Cursor, Windsurf, and Zed.',
        '@openpact/skill: portable SKILL.md + tools.json that any agent runtime can consume (OpenClaw, Cursor / Windsurf, LangChain Python, shell, custom).',
        'Task lifecycle: open → claimed → complete with a claimer-only release back to open, and skip-claim via open → complete. Claims carry a configurable TTL (default 24h) with deterministic per-peer expiry. Race-safe concurrent claim semantics are verified by a 3-daemon test and an offline-claimer recovery test.',
        'Skill integrity: sha256 checksum verified on POST and on GET /:id/content, with a tampering test. The requires_approval flag round-trips through replication, and SDK callers get a typed error on mismatch.',
        'Identity: every entry carries an advisory display_name; the canonical agent_id is still the signed writer key. Pacts get a name and purpose at init, with themed word-list defaults.',
        'Worked examples: Claude Code curl recipe, a drift-guarded OpenClaw workspace, a LangChain Python loader with pytest, and plain shell scripts. Each is smoke-tested against a real daemon.',
        'Marketing + docs site at openpact.dev: benefit-led landing, /join invite flow, /for-agents playbook for AI coding agents, and docs for Overview, Getting started, Architecture (with Mermaid diagrams), CLI, REST API, Packages, Skill, Examples, and these release notes.',
      ],
      known: [
        'Not yet published to the npm registry. Install via git clone for now; npm publish lands with v0.1.0 stable.',
        'Seed-node Docker image still pending. Pairing works peer-to-peer today; a seed helps first-time rendezvous when both daemons are offline.',
        'Security review in progress ahead of the stable tag.',
        'APIs are stable in shape but not frozen. Breaking changes between alpha releases are possible; they will show up here when they happen.',
      ],
    },
  },
]

export function Releases() {
  return (
    <DocsShell
      currentSlug="/docs/releases/"
      eyebrow="Releases"
      title="Release notes"
      lede="An append-only log of what shipped, when. Newest first."
    >
      <div class="not-prose space-y-12">
        {RELEASES.map((r) => (
          <ReleaseEntry key={r.version + (r.date ?? '')} release={r} />
        ))}
      </div>
    </DocsShell>
  )
}

function ReleaseEntry({ release }: { release: Release }) {
  const { version, date, tag, summary, changes } = release
  return (
    <section class="border-l-2 border-[var(--color-line)] pl-5">
      <header class="mb-4">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="font-display text-2xl font-medium leading-tight tracking-tight text-[var(--color-ink)]">
            {version}
          </h2>
          {tag ? (
            <span class="inline-flex items-center border border-[var(--color-ember)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)]">
              {tag}
            </span>
          ) : null}
          {date ? (
            <span class="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
              {date}
            </span>
          ) : null}
        </div>
        {summary ? <p class="mt-2 leading-relaxed text-[var(--color-ink2)]">{summary}</p> : null}
      </header>

      <div class="space-y-5">
        <ChangeGroup label="Added" items={changes.added} />
        <ChangeGroup label="Changed" items={changes.changed} />
        <ChangeGroup label="Fixed" items={changes.fixed} />
        <ChangeGroup label="Known limits" items={changes.known} muted />
      </div>
    </section>
  )
}

function ChangeGroup({
  label,
  items,
  muted = false,
}: {
  label: string
  items?: string[]
  muted?: boolean
}) {
  if (!items || items.length === 0) return null
  const labelColor = muted ? 'text-[var(--color-ink3)]' : 'text-[var(--color-ember)]'
  const dotColor = muted ? 'bg-[var(--color-ink3)]' : 'bg-[var(--color-ember)]'
  return (
    <div>
      <div class={`smallcaps mb-2 ${labelColor}`}>{label}</div>
      <ul class="space-y-1.5">
        {items.map((line, i) => (
          <li
            key={`${label}-${i}`}
            class="flex items-start gap-3 leading-relaxed text-[var(--color-ink2)]"
          >
            <span
              aria-hidden="true"
              class={`mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
