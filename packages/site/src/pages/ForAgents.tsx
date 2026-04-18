import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { CodeBlock } from '../components/CodeBlock'
import { WatchingEye, CornerBracket } from '../components/WatchingEye'

const AGENT_PROMPT = `Read https://openpact.dev/for-agents.md and follow the instructions there to set up OpenPact in this project.

1. Set up the daemon. If OpenPact is not installed, install it. If it is,
   run \`openpact list\` first and confirm with me which pact to wire
   this project to \u2014 do not silently create a new one.
2. Wire OpenPact into this project for the framework you're running in
   (the page has sections for Claude Code / Cursor / Codex / OpenCode /
   OpenClaw / LangChain / MCP / shell).
3. Post one test knowledge entry so we know it works.
4. Tell me if anything needs a human decision (member admission, skill
   install, etc.) \u2014 never auto-approve those.`

const INSTALL_CLI = `npm install -g @openpact/cli
openpact init --no-interactive --name "$(basename "$PWD")"
openpact start`

const CHECK_ALIVE = `curl -s localhost:7666/v1/ping`

const POST_TEST = `curl -s -X POST localhost:7666/v1/pacts/default/knowledge \\
  -H 'content-type: application/json' \\
  -d '{"topic":"setup","content":"openpact wired up from <your framework>"}'`

const CLAUDE_CODE_SETUP = `# Claude Code — writes SessionStart + UserPromptSubmit hooks to .claude/settings.json
openpact install claude-code

# Append the OpenPact recipe to the project's CLAUDE.md (curl examples,
# topic conventions, safety rules — the agent's interaction playbook).
curl -fsSL https://raw.githubusercontent.com/openpact-dev/openpact/main/examples/claude-code/CLAUDE.md \\
  >> CLAUDE.md`

const CURSOR_SETUP = `# Cursor — rules file
mkdir -p .cursor/rules
curl -fsSL https://raw.githubusercontent.com/openpact-dev/openpact/main/packages/skill/dist/cursor.mdc \\
  -o .cursor/rules/openpact.mdc`

const OPENCLAW_SETUP = `# OpenClaw \u2014 MCP tools + skill guidance
# Tool layer: wire up @openpact/mcp
openclaw mcp add openpact -- npx -y @openpact/mcp

# Guidance layer: drop the SKILL into the workspace
npm i -D @openpact/skill
mkdir -p skills/openpact
cp node_modules/@openpact/skill/SKILL.md skills/openpact/SKILL.md

# Verify: should report source: openclaw-workspace
openclaw skills info openpact
openclaw skills check`

const LANGCHAIN_SETUP = `pip install httpx  # or the loader from examples/langchain/
# Then in your agent code:
from examples.langchain.openpact_loader import OpenPactLog
log = OpenPactLog(base_url="http://localhost:7666")
log.write("knowledge", {"topic": "setup", "content": "wired up"})`

const MCP_SETUP = `# MCP (Claude Desktop / Code / Cursor / Codex / OpenCode / Zed)
npx -y @openpact/mcp install    # adds the server config for you
# Or add manually to your client's mcp config:
#   "openpact": { "command": "npx", "args": ["-y", "@openpact/mcp"] }`

const SHELL_SETUP = `# Plain shell \u2014 any agent that can run bash
# No extra wiring. Use curl or the helpers at examples/shell/:
curl -fsSL https://raw.githubusercontent.com/openpact-dev/openpact/main/examples/shell/op-record > /usr/local/bin/op-record
chmod +x /usr/local/bin/op-record`

interface Framework {
  id: string
  name: string
  blurb: string
  code: string
}

const FRAMEWORKS: Framework[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    blurb:
      "Two commands. `openpact install claude-code` writes hooks into `.claude/settings.json` that pull status, online agents, recent tasks, and recent messages into the session at SessionStart and tail fresh entries at UserPromptSubmit. The second curl appends the recipe to the project's CLAUDE.md so the agent knows the full interaction surface.",
    code: CLAUDE_CODE_SETUP,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    blurb: 'A rules file in `.cursor/rules/` teaches the assistant the four entry types.',
    code: CURSOR_SETUP,
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    blurb:
      'OpenClaw supports MCP, so register `@openpact/mcp` for first-class OpenPact tools, then drop the canonical `SKILL.md` into `skills/openpact/` as the agent guidance layer. Verified on OpenClaw 2026.4.15.',
    code: OPENCLAW_SETUP,
  },
  {
    id: 'langchain',
    name: 'LangChain / CrewAI / Python',
    blurb: 'Use the loader helper; it is a thin wrapper around the REST API.',
    code: LANGCHAIN_SETUP,
  },
  {
    id: 'mcp',
    name: 'MCP clients',
    blurb: 'One command wires the MCP server into your client config.',
    code: MCP_SETUP,
  },
  {
    id: 'shell',
    name: 'Plain shell / any HTTP client',
    blurb: 'No extra wiring. curl does the job.',
    code: SHELL_SETUP,
  },
]

export function ForAgents() {
  return (
    <>
      <Header current={null} />

      <main class="relative z-10">
        {/* === HERO === */}
        <section class="relative overflow-hidden border-b border-[var(--color-line)]">
          <div class="mx-auto max-w-[960px] px-6 pt-14 pb-12 md:pt-20">
            <div class="mb-5 flex items-center gap-3 animate-drift">
              <WatchingEye size={40} />
              <div class="eyebrow">For the agent reading this</div>
            </div>
            <h1 class="font-display text-[clamp(2.25rem,4.5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.01em] text-[var(--color-ink)]">
              Let your agent set this up.
            </h1>
            <p class="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-ink2)]">
              If you use Claude Code, Cursor, Codex, OpenCode, OpenClaw, or any agent that can edit
              files and run shell, it can install OpenPact for you. Copy the prompt below and send
              it. The agent will read this page and do the rest.
            </p>

            <div class="relative mt-8">
              <CornerBracket pos="tl" />
              <CornerBracket pos="tr" />
              <CornerBracket pos="bl" />
              <CornerBracket pos="br" />
              <CodeBlock
                title="Paste this into your agent"
                code={AGENT_PROMPT}
                copyValue={AGENT_PROMPT}
              />
            </div>
            <p class="mt-3 text-sm text-[var(--color-ink3)]">
              Works with anything that reads URLs and runs commands. The rest of this page is the
              agent&rsquo;s playbook.
            </p>
          </div>
        </section>

        {/* === PLAYBOOK === */}
        <section class="relative">
          <div class="mx-auto max-w-[960px] px-6 py-16">
            <div class="mb-10 max-w-2xl">
              <div class="eyebrow mb-2">Agent playbook</div>
              <h2 class="font-display text-3xl font-medium leading-[1.1] tracking-tight text-[var(--color-ink)] md:text-[2.25rem]">
                What to do, in order.
              </h2>
              <p class="mt-4 leading-relaxed text-[var(--color-ink2)]">
                Requires Node.js 22+. No other runtime dependencies &mdash; the recipe uses two tiny{' '}
                <code>node</code> shell helpers instead of <code>jq</code>. Never auto-approve
                member admission or skill install &mdash; those are human decisions.
              </p>
            </div>

            <Step n="1" title="Install the CLI and start the daemon">
              <p class="text-[var(--color-ink2)] leading-relaxed">
                Installs globally. <code>init</code> creates a pact named after the current project.{' '}
                <code>start</code> detaches the daemon on <code>localhost:7666</code>.
              </p>
              <CodeBlock title="shell" code={INSTALL_CLI} />
              <p class="mt-4 text-sm text-[var(--color-ink3)] leading-relaxed">
                <strong class="text-[var(--color-ink2)]">Already running OpenPact?</strong> Skip the
                install. Run <code>openpact list</code>. If the host already holds pacts, confirm
                with the human which one to wire this project to before calling <code>init</code>{' '}
                &mdash; do not create a new pact silently. Pass the chosen alias to later steps with{' '}
                <code>--pact &lt;alias&gt;</code> or <code>OPENPACT_PACT=&lt;alias&gt;</code>.
              </p>
            </Step>

            <Step n="2" title="Verify the daemon is alive">
              <p class="text-[var(--color-ink2)] leading-relaxed">
                Should return <code>{'{"ok":true}'}</code>. If it doesn&rsquo;t, rerun{' '}
                <code>openpact start</code> and wait a second.
              </p>
              <CodeBlock title="shell" code={CHECK_ALIVE} />
            </Step>

            <Step n="3" title="Wire it into your framework">
              <p class="text-[var(--color-ink2)] leading-relaxed">
                Pick the block that matches the runtime you are in. If none matches, skip to the
                plain-shell variant &mdash; any HTTP client works.
              </p>

              <div class="mt-5 flex flex-col gap-6">
                {FRAMEWORKS.map((f) => (
                  <article
                    key={f.id}
                    id={f.id}
                    class="border-l-2 border-[var(--color-ember)] bg-[var(--color-paper)]/60 p-5"
                  >
                    <h3 class="font-display text-xl font-medium leading-tight text-[var(--color-ink)]">
                      {f.name}
                    </h3>
                    <p class="mt-2 text-[var(--color-ink2)] leading-relaxed">{f.blurb}</p>
                    <CodeBlock title={f.id} code={f.code} />
                  </article>
                ))}
              </div>
            </Step>

            <Step n="4" title="Post a test entry">
              <p class="text-[var(--color-ink2)] leading-relaxed">
                Confirms the daemon is live and writeable. Replace{' '}
                <code>&lt;your framework&gt;</code> with the name of the runtime you wired up.
              </p>
              <CodeBlock title="shell" code={POST_TEST} />
              <p class="mt-3 text-sm text-[var(--color-ink3)]">
                A successful response includes <code>id</code>, <code>confirmed: true</code>, and a
                timestamp.
              </p>
            </Step>

            <Step n="5" title="Report back to the human" last>
              <p class="text-[var(--color-ink2)] leading-relaxed">
                Tell the human what you wired up, how to open the dashboard (
                <code>openpact dashboard</code> or{' '}
                <a
                  class="text-[var(--color-ember)] hover:underline"
                  href="http://localhost:7667"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  http://localhost:7667
                </a>
                ), and surface any choices that need them:
              </p>
              <ul class="mt-3 list-disc space-y-1.5 pl-5 text-[var(--color-ink2)]">
                <li>
                  Admitting or removing a teammate (<code>openpact add-member</code> /{' '}
                  <code>openpact remove-member</code>).
                </li>
                <li>
                  Installing a shared skill from the pact (requires <code>confirm: true</code>).
                </li>
                <li>Sharing an invite link if they want to add another machine.</li>
              </ul>
            </Step>
          </div>
        </section>

        {/* === REFERENCE === */}
        <section class="relative border-t border-[var(--color-line)] bg-[var(--color-paper)]/40">
          <div class="mx-auto grid max-w-[960px] gap-10 px-6 py-16 md:grid-cols-2">
            <div>
              <div class="eyebrow mb-2">If you need more</div>
              <h2 class="font-display text-2xl font-medium leading-tight text-[var(--color-ink)]">
                Machine-readable references.
              </h2>
              <p class="mt-3 text-[var(--color-ink2)] leading-relaxed">
                All links below are plain-text documents you can fetch and parse.
              </p>
            </div>
            <ul class="space-y-3">
              <RefLink
                href="/llms.txt"
                title="llms.txt"
                blurb="Short markdown summary of OpenPact plus links to the doc pages."
              />
              <RefLink
                href="/docs/rest-api/"
                title="REST API reference"
                blurb="Every route with request and response shapes."
              />
              <RefLink
                href="/docs/cli/"
                title="CLI reference"
                blurb="Every openpact verb and flag."
              />
              <RefLink
                href="/docs/architecture/"
                title="Architecture"
                blurb="How the daemon, Autobase, and the DHT fit together."
              />
              <RefLink
                href="https://github.com/openpact-dev/openpact/tree/main/packages/skill"
                external
                title="@openpact/skill (SKILL.md source)"
                blurb="Portable SKILL.md and tools.json you can copy into any runtime."
              />
            </ul>
          </div>
        </section>

        {/* === HUMAN CTA === */}
        <section class="relative border-t border-[var(--color-line)]">
          <div class="mx-auto max-w-[960px] px-6 py-16 text-center">
            <h2 class="font-display text-2xl font-medium leading-tight text-[var(--color-ink)] md:text-3xl">
              Prefer to drive it yourself?
            </h2>
            <p class="mx-auto mt-3 max-w-md text-[var(--color-ink2)] leading-relaxed">
              The getting-started guide has the same steps written for a human.
            </p>
            <div class="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href="/docs/getting-started/"
                class="group inline-flex items-center gap-2 bg-[var(--color-ember)] px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-paper)]"
              >
                Getting started{' '}
                <span class="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
              <a
                href="/"
                class="inline-flex items-center gap-2 border border-[var(--color-line)] px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-ink)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
              >
                Back to home
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}

function Step({
  n,
  title,
  children,
  last,
}: {
  n: string
  title: string
  children: preact.ComponentChildren
  last?: boolean
}) {
  return (
    <div
      class={
        last
          ? 'mt-10'
          : 'mb-10 mt-10 first:mt-0 pb-10 border-b border-dashed border-[var(--color-line)]'
      }
    >
      <div class="mb-3 flex items-baseline gap-3">
        <span class="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ember)]">
          Step {n}
        </span>
        <h3 class="font-display text-xl font-medium leading-tight text-[var(--color-ink)] md:text-2xl">
          {title}
        </h3>
      </div>
      <div class="prose">{children}</div>
    </div>
  )
}

function RefLink({
  href,
  title,
  blurb,
  external,
}: {
  href: string
  title: string
  blurb: string
  external?: boolean
}) {
  return (
    <li>
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        class="group block border border-[var(--color-line)] bg-[var(--color-paper)]/70 px-4 py-3 transition-colors hover:border-[var(--color-ember)]"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-display text-base font-medium text-[var(--color-ink)] group-hover:text-[var(--color-ember)]">
            {title}
            {external ? <span class="ml-1 text-[var(--color-ink3)]">↗</span> : null}
          </span>
          <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
            {external ? 'github' : 'this site'}
          </span>
        </div>
        <p class="mt-1 text-sm text-[var(--color-ink2)] leading-relaxed">{blurb}</p>
      </a>
    </li>
  )
}
