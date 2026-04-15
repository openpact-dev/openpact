import { DocsShell } from '../../pages/DocsShell'
import { CodeBlock } from '../../components/CodeBlock'

interface Example {
  id: string
  name: string
  role: string
  href: string
  body: preact.JSX.Element
}

const EXAMPLES: Example[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    role: 'curl + jq recipe in CLAUDE.md',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/claude-code',
    body: (
      <>
        The simplest possible integration. Drop the recipe into your <code>CLAUDE.md</code> and
        Claude Code will use <code>curl</code> + <code>jq</code> to read and write the log directly.
        No runtime dependencies. No language choice. Useful when you want Claude to remember things
        across sessions without committing to a larger agent stack.
      </>
    ),
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    role: 'Drift-guarded workspace',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/openclaw',
    body: (
      <>
        A ready-made OpenClaw workspace at <code>examples/openclaw/.openclaw/</code>. The SKILL file
        is a checked-in copy of the canonical one from <code>@openpact/skill</code>, and a CI test
        fails the build if the two drift. Copy the directory into your project and OpenClaw has what
        it needs.
      </>
    ),
  },
  {
    id: 'langchain',
    name: 'LangChain (Python)',
    role: 'pytest-smoked loader',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/langchain',
    body: (
      <>
        A Python loader that reads <code>tools.json</code> and exposes every OpenPact endpoint as a
        LangChain tool. Ships with a pytest suite that spins up a real daemon, posts a knowledge
        entry, and round-trips it through the agent. The same pattern works for CrewAI and any
        Python framework that consumes JSON tool manifests.
      </>
    ),
  },
  {
    id: 'shell',
    name: 'Plain shell scripts',
    role: 'bash helpers and smoke tests',
    href: 'https://github.com/openpact-dev/openpact/tree/main/examples/shell',
    body: (
      <>
        Small bash helpers (<code>op-record</code>, <code>op-recall</code>, <code>op-task</code>,{' '}
        <code>op-send</code>) that wrap the REST API for one-liner use from any shell agent, cron
        job, or CI pipeline. Useful as a sanity check that your daemon is wired up before
        introducing a heavier framework.
      </>
    ),
  },
]

const QUICK_CURL = `curl -X POST localhost:7666/v1/pacts/default/knowledge \\
  -H 'content-type: application/json' \\
  -d '{"topic":"demo","content":"hello from any language"}'`

export function Examples() {
  return (
    <DocsShell
      currentSlug="/docs/examples/"
      eyebrow="Docs"
      title="Examples"
      lede="Worked integrations for the four biggest agent surfaces. Each one is smoke-tested against a real daemon on every PR."
    >
      <p>
        All examples live under{' '}
        <a
          href="https://github.com/openpact-dev/openpact/tree/main/examples"
          target="_blank"
          rel="noopener noreferrer"
        >
          examples/
        </a>{' '}
        in the repo. Each has a README, the files you need to drop in, and a test under{' '}
        <code>test/</code> that verifies the example still works end-to-end.
      </p>

      <div class="my-8 space-y-5 not-prose">
        {EXAMPLES.map((e) => (
          <article
            key={e.id}
            id={e.id}
            class="border-l-2 border-[var(--color-ember)] bg-[var(--color-paper)]/70 px-5 py-4"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 class="font-display text-xl font-medium leading-tight text-[var(--color-ink)]">
                {e.name}
              </h3>
              <span class="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
                {e.role}
              </span>
            </div>
            <p class="mt-2 text-[var(--color-ink2)] leading-relaxed">{e.body}</p>
            <a
              href={e.href}
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] hover:underline"
            >
              Source on GitHub ↗
            </a>
          </article>
        ))}
      </div>

      <h2>Your own runtime</h2>
      <p>
        If your agent speaks HTTP, you already have everything you need. Point it at the daemon and
        post.
      </p>
      <CodeBlock title="any language, any runtime" code={QUICK_CURL} />
      <p>
        For a typed client, use{' '}
        <a
          href="https://www.npmjs.com/package/@openpact/sdk"
          target="_blank"
          rel="noopener noreferrer"
        >
          @openpact/sdk
        </a>
        . For MCP clients, use <a href="/docs/packages/">@openpact/mcp</a>. For everything else,{' '}
        <a href="/docs/rest-api/">the REST API reference</a> has every route.
      </p>

      <h2>Let the agent wire it up</h2>
      <p>
        If you would rather not do this by hand, point your AI agent at{' '}
        <a href="/for-agents/">openpact.dev/for-agents</a>. It will pick the right example for its
        own runtime, install, and post a test entry.
      </p>
    </DocsShell>
  )
}
