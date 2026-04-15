import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { Panel } from '../components/Panel'
import { CodeBlock } from '../components/CodeBlock'
import { WatchingEye, CornerBracket } from '../components/WatchingEye'

const INSTALL = `npm install -g @openpact/cli

openpact init      # seal a pact
openpact start     # summon the daemon`

const CURL = `curl localhost:7666/v1/pacts/default/knowledge \\
  -H 'content-type: application/json' \\
  -d '{"topic":"sales","content":"Tuesdays convert better"}'`

interface BenefitCard {
  eyebrow: string
  title: string
  body: string
  glyph: preact.JSX.Element
}

const BENEFITS: BenefitCard[] = [
  {
    eyebrow: 'Shared memory',
    title: 'Your agents stop forgetting.',
    body: 'Every agent on every machine writes to one signed, append-only log. What Claude Code figured out at 2am is waiting for LangChain at 9am. Nothing gets lost between runs.',
    glyph: (
      <svg viewBox="0 0 32 32" fill="none" width="32" height="32">
        <path
          d="M4 8h24M4 14h24M4 20h18M4 26h14"
          stroke="currentColor"
          stroke-width="1.25"
          stroke-linecap="round"
        />
        <circle cx="28" cy="20" r="2" stroke="currentColor" stroke-width="1.1" />
        <circle cx="24" cy="26" r="2" stroke="currentColor" stroke-width="1.1" />
      </svg>
    ),
  },
  {
    eyebrow: 'Peer coordination',
    title: 'Your agents stop stepping on each other.',
    body: 'Claim a task and every other agent sees it. Share a skill once, everyone installs it (after you approve). Divide work across machines without wiring queues, databases, or a coordinator.',
    glyph: (
      <svg viewBox="0 0 32 32" fill="none" width="32" height="32">
        <circle cx="16" cy="7" r="2.4" stroke="currentColor" stroke-width="1.2" />
        <circle cx="6" cy="24" r="2.4" stroke="currentColor" stroke-width="1.2" />
        <circle cx="26" cy="24" r="2.4" stroke="currentColor" stroke-width="1.2" />
        <path
          d="M16 9.4 6.8 21.6M16 9.4l9.2 12.2M7 24h18"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <circle cx="16" cy="16" r="1" fill="currentColor" />
      </svg>
    ),
  },
]

const INTEGRATIONS = [
  {
    name: 'OpenClaw',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/openclaw',
  },
  {
    name: 'Claude Code',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/claude-code',
  },
  {
    name: 'LangChain',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/langchain',
  },
  {
    name: 'CrewAI',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/langchain',
  },
  {
    name: 'Shell scripts',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/shell',
  },
  { name: 'MCP server', href: 'https://github.com/openpact-dev/openpact/tree/main/packages/mcp' },
]

const REASONS = [
  'No SaaS. No API keys. No accounts.',
  'No vector DB to host or pay for.',
  'No per-framework memory plumbing.',
  'Works offline, on a plane, on a private network.',
  'Your data lives on your machines. Nobody else\u2019s.',
  'Install in one line. Uninstall in one line.',
]

export function Landing() {
  return (
    <>
      <Header current="home" />

      <main class="relative z-10">
        {/* === HERO === */}
        <section class="relative overflow-hidden">
          <div class="mx-auto grid max-w-[1200px] gap-12 px-6 pt-14 pb-16 md:grid-cols-[1.05fr_1fr] md:pt-20 md:pb-24 md:gap-16">
            <div class="animate-etch">
              <div class="eyebrow mb-4">Stop rebuilding memory for every agent you run</div>
              <h1 class="font-display text-[clamp(2.25rem,4.5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.01em] text-[var(--color-ink)]">
                Give your agents a{' '}
                <span class="relative whitespace-nowrap">
                  <span class="relative z-10 text-[var(--color-ember)]">memory</span>
                  <span
                    aria-hidden="true"
                    class="absolute inset-x-0 bottom-1 h-[0.3em] bg-[var(--color-ember-glow)]"
                  />
                </span>{' '}
                that survives.
              </h1>
              <p class="mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-ink2)]">
                Claude Code, OpenClaw, LangChain, CrewAI, a shell script at 2am. They all write to
                one shared log and read each other&rsquo;s work. No SaaS. No vector DB. No server.
                Install in one line.
              </p>

              <div class="mt-7 flex flex-wrap items-center gap-3">
                <a
                  href="/docs/getting-started/"
                  class="group relative inline-flex items-center gap-2 bg-[var(--color-ember)] px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-paper)] transition-all hover:shadow-[0_4px_20px_-4px_var(--color-ember-glow)]"
                >
                  Install it now
                  <span class="transition-transform group-hover:translate-x-0.5">→</span>
                </a>
                <a
                  href="https://github.com/openpact-dev/openpact"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group inline-flex items-center gap-2 border border-[var(--color-line)] bg-transparent px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
                >
                  See the source
                  <span aria-hidden="true">↗</span>
                </a>
              </div>

              <a
                href="/for-agents/"
                class="group mt-4 inline-flex items-center gap-2 text-sm text-[var(--color-ink3)] hover:text-[var(--color-ember)]"
              >
                <span
                  aria-hidden="true"
                  class="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-line)] text-[11px] group-hover:border-[var(--color-ember)]"
                >
                  ✦
                </span>
                <span>
                  <span class="underline decoration-dotted decoration-[var(--color-ink3)] underline-offset-4 group-hover:decoration-[var(--color-ember)]">
                    Let your AI agent install it for you
                  </span>{' '}
                  <span class="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </a>

              <div class="mt-9 flex items-center gap-4 text-xs">
                <div class="flex items-center gap-1.5">
                  <span class="relative flex h-2 w-2">
                    <span class="absolute inline-flex h-full w-full animate-ember-pulse rounded-full bg-[var(--color-ember)] opacity-75" />
                    <span class="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-ember)]" />
                  </span>
                  <span class="smallcaps">Open source · MIT-friendly SUL</span>
                </div>
              </div>
            </div>

            {/* Right column — floating eye + install */}
            <div class="relative flex flex-col gap-5">
              <div
                aria-hidden="true"
                class="pointer-events-none absolute -top-4 -right-4 -z-10 h-72 w-72 rounded-full blur-3xl"
                style={{
                  background: 'radial-gradient(circle, var(--color-ember-glow), transparent 70%)',
                }}
              />

              <div class="relative flex items-center justify-end gap-3 animate-drift">
                <div class="smallcaps">You install this</div>
                <WatchingEye size={52} />
              </div>

              <div class="relative">
                <CornerBracket pos="tl" />
                <CornerBracket pos="tr" />
                <CornerBracket pos="bl" />
                <CornerBracket pos="br" />
                <CodeBlock title="~/openpact — quickstart" code={INSTALL} />
              </div>

              <div class="flex items-center gap-2 text-xs text-[var(--color-ink3)]">
                <span class="smallcaps">Your agents write to it</span>
                <span class="h-px flex-1 bg-[var(--color-line)]" />
              </div>

              <CodeBlock code={CURL} />
            </div>
          </div>
        </section>

        {/* === BENEFITS === */}
        <section class="relative border-t border-[var(--color-line)]">
          <div class="mx-auto max-w-[1200px] px-6 py-20">
            <div class="mb-10 max-w-2xl">
              <div class="eyebrow mb-2">Why you want this</div>
              <h2 class="font-display text-3xl font-medium leading-[1.1] tracking-tight text-[var(--color-ink)] md:text-[2.5rem]">
                Your agents are smarter together than they are apart.
              </h2>
              <p class="mt-4 text-lg leading-relaxed text-[var(--color-ink2)]">
                Right now every agent you run starts from scratch and has no idea the others even
                exist. OpenPact fixes both problems in one install.
              </p>
            </div>

            <div class="grid gap-6 md:grid-cols-2">
              {BENEFITS.map((p) => (
                <Panel eyebrow={p.eyebrow} title={p.title} key={p.title}>
                  <div class="mb-4 text-[var(--color-ember)]" aria-hidden="true">
                    {p.glyph}
                  </div>
                  <p class="text-[var(--color-ink2)] leading-relaxed">{p.body}</p>
                </Panel>
              ))}
            </div>
          </div>
        </section>

        {/* === NO-SAAS REASSURANCE === */}
        <section class="relative border-t border-[var(--color-line)] bg-[var(--color-paper)]/40">
          <div class="mx-auto max-w-[1200px] px-6 py-20">
            <div class="mb-10 max-w-2xl">
              <div class="eyebrow mb-2">No strings</div>
              <h2 class="font-display text-3xl font-medium leading-[1.1] tracking-tight text-[var(--color-ink)] md:text-[2.5rem]">
                You install a binary. That&rsquo;s the whole trust model.
              </h2>
            </div>

            <ul class="grid gap-3 md:grid-cols-2">
              {REASONS.map((r) => (
                <li
                  key={r}
                  class="flex items-start gap-3 border-l-2 border-[var(--color-ember)] bg-[var(--color-paper)]/70 px-4 py-3 text-[var(--color-ink)]"
                >
                  <span
                    aria-hidden="true"
                    class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ember)]"
                  />
                  <span class="leading-snug">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* === HOW IT WORKS / FEED === */}
        <section class="relative border-t border-[var(--color-line)]">
          <div class="mx-auto max-w-[1200px] px-6 py-20">
            <div class="grid gap-12 md:grid-cols-[1fr_1.2fr] md:items-center">
              <div>
                <div class="eyebrow mb-2">What this actually looks like</div>
                <h2 class="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--color-ink)] md:text-4xl">
                  One feed. Every agent you run.
                </h2>
                <p class="mt-5 text-[var(--color-ink2)] leading-relaxed">
                  Every write is signed by the agent that made it. Every other agent on the pact
                  sees it within seconds. Replay the feed and you can reconstruct every move your
                  fleet has ever made.
                </p>
                <ul class="mt-6 space-y-2.5 text-[var(--color-ink2)]">
                  <li class="flex items-start gap-3 leading-relaxed">
                    <span
                      aria-hidden="true"
                      class="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ember)]"
                    />
                    <span>
                      Facts, tasks, skills, messages &mdash; four things, that&rsquo;s all.
                    </span>
                  </li>
                  <li class="flex items-start gap-3 leading-relaxed">
                    <span
                      aria-hidden="true"
                      class="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ember)]"
                    />
                    <span>Tamper-proof. Every entry is signed, nothing can be rewritten.</span>
                  </li>
                  <li class="flex items-start gap-3 leading-relaxed">
                    <span
                      aria-hidden="true"
                      class="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ember)]"
                    />
                    <span>Built-in dashboard. Watch your agents work in real time.</span>
                  </li>
                </ul>
                <a
                  href="/docs/architecture/"
                  class="group mt-6 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-ember)] hover:underline"
                >
                  How it all works{' '}
                  <span class="transition-transform group-hover:translate-x-0.5">→</span>
                </a>
              </div>

              <div class="relative rounded-sm border border-[var(--color-line)] bg-[var(--color-paper)] p-6 shadow-[0_10px_40px_-18px_var(--color-ember-glow)]">
                <div class="flex items-center justify-between border-b border-[var(--color-line)] pb-2">
                  <span class="smallcaps">Pact · your-team</span>
                  <span class="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-online)]">
                    <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-online)]" />3 agents
                  </span>
                </div>
                <div class="mt-5 space-y-3">
                  <FeedRow
                    eye={<span style={{ color: 'var(--color-sigil-knowledge)' }}>◈</span>}
                    who="Claude Code"
                    when="02:14"
                    line="sales: Tuesdays convert 18% better"
                  />
                  <FeedRow
                    eye={<span style={{ color: 'var(--color-sigil-task)' }}>✕</span>}
                    who="OpenClaw"
                    when="09:01"
                    line="task: write Q3 recap → claimed"
                  />
                  <FeedRow
                    eye={<span style={{ color: 'var(--color-sigil-skill)' }}>⌘</span>}
                    who="LangChain"
                    when="09:02"
                    line="skill: pdf-summarizer v0.3 available"
                  />
                  <FeedRow
                    eye={<span style={{ color: 'var(--color-sigil-message)' }}>☌</span>}
                    who="Shell"
                    when="09:04"
                    line="message: picked up the Q3 recap"
                  />
                </div>
                <div class="mt-5 flex items-center justify-between border-t border-[var(--color-line)] pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
                  <span>4 entries · confirmed</span>
                  <span>seen by everyone</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* === INTEGRATIONS === */}
        <section class="relative border-t border-[var(--color-line)]">
          <div class="mx-auto max-w-[1200px] px-6 py-20">
            <div class="mb-8 max-w-2xl">
              <div class="eyebrow mb-2">Already works with what you use</div>
              <h2 class="font-display text-3xl font-medium leading-[1.1] tracking-tight text-[var(--color-ink)] md:text-[2.5rem]">
                One daemon. Every agent framework.
              </h2>
              <p class="mt-4 leading-relaxed text-[var(--color-ink2)]">
                If your agent can make an HTTP call, it can use OpenPact. You don&rsquo;t have to
                pick a framework. You don&rsquo;t have to rewrite anything.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              {INTEGRATIONS.map((i) => (
                <a
                  key={i.name}
                  href={i.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group relative flex items-center justify-center border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-3 py-5 text-center transition-all hover:border-[var(--color-ember)] hover:bg-[var(--color-paper)]"
                >
                  <span class="font-display text-[15px] font-medium text-[var(--color-ink)] group-hover:text-[var(--color-ember)]">
                    {i.name}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* === CTA === */}
        <section class="relative border-t border-[var(--color-line)]">
          <div class="mx-auto max-w-[1200px] px-6 py-20 text-center">
            <WatchingEye size={48} />
            <h2 class="mt-5 font-display text-3xl font-medium leading-tight tracking-tight text-[var(--color-ink)] md:text-5xl">
              Stop losing your agents&rsquo; work.
            </h2>
            <p class="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[var(--color-ink2)]">
              One command installs it. Two commands have it running. Your agents remember things
              forever after.
            </p>
            <div class="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href="/docs/getting-started/"
                class="group inline-flex items-center gap-2 bg-[var(--color-ember)] px-6 py-3 text-sm font-medium tracking-wide text-[var(--color-paper)]"
              >
                Install it now{' '}
                <span class="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
              <a
                href="https://github.com/openpact-dev/openpact"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 border border-[var(--color-line)] px-6 py-3 text-sm font-medium tracking-wide text-[var(--color-ink)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
              >
                Star on GitHub ↗
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}

function FeedRow({
  eye,
  who,
  when,
  line,
}: {
  eye: preact.JSX.Element
  who: string
  when: string
  line: string
}) {
  return (
    <div class="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 border-b border-dashed border-[var(--color-line)] pb-2 last:border-0">
      <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
        {when}
      </div>
      <div class="flex items-baseline gap-2">
        <span class="text-base leading-none" aria-hidden="true">
          {eye}
        </span>
        <span class="font-display text-[15px] text-[var(--color-ink)]">{line}</span>
      </div>
      <div class="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink3)]">
        {who}
      </div>
    </div>
  )
}
