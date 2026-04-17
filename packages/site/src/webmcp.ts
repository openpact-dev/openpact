// Expose a few OpenPact actions to agent-aware browsers via WebMCP
// (navigator.modelContext.provideContext). Feature-detected, no-op
// everywhere the API is absent.
//
// Spec: https://webmachinelearning.github.io/webmcp/

type ToolExecuteResult = { content: Array<{ type: 'text'; text: string }> }

interface WebMCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>) => Promise<ToolExecuteResult> | ToolExecuteResult
}

interface ModelContext {
  provideContext(config: { tools: WebMCPTool[] }): void
}

function getModelContext(): ModelContext | null {
  const nav = navigator as unknown as { modelContext?: ModelContext }
  return typeof nav.modelContext?.provideContext === 'function' ? nav.modelContext : null
}

const DOCS: Record<string, { path: string; summary: string }> = {
  overview: { path: '/docs/', summary: 'What OpenPact is and why it exists.' },
  'getting-started': {
    path: '/docs/getting-started/',
    summary: 'Install the CLI, seal a pact, pair two daemons.',
  },
  cli: { path: '/docs/cli/', summary: 'Every openpact verb and its flags.' },
  'rest-api': {
    path: '/docs/rest-api/',
    summary: 'REST routes on the local daemon (127.0.0.1:7666).',
  },
  architecture: {
    path: '/docs/architecture/',
    summary: 'Entry schema, peer roles, the Holepunch stack underneath.',
  },
  packages: { path: '/docs/packages/', summary: 'Every npm package in the monorepo.' },
  skill: { path: '/docs/skill/', summary: 'Portable SKILL.md + tools.json.' },
  examples: { path: '/docs/examples/', summary: 'Worked integrations for popular runtimes.' },
  releases: { path: '/docs/releases/', summary: 'What shipped, newest first.' },
  roadmap: { path: '/docs/roadmap/', summary: 'What is next.' },
}

function text(body: string): ToolExecuteResult {
  return { content: [{ type: 'text', text: body }] }
}

export function registerWebMCPTools(): void {
  const mc = getModelContext()
  if (!mc) return

  mc.provideContext({
    tools: [
      {
        name: 'openpact_overview',
        description:
          'Return a one-paragraph overview of what OpenPact is, suitable for orienting a new agent.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: () =>
          text(
            'OpenPact is a local-first, peer-to-peer daemon that gives software agents a shared, append-only log. ' +
              'Agents on different machines join the same pact and replicate over a DHT with no central coordinator. ' +
              'The daemon listens on 127.0.0.1:7666 and exposes a REST API covering knowledge, tasks, messages, and skills. ' +
              'Built on Hypercore, Autobase, Hyperswarm, and Hyperbee.',
          ),
      },
      {
        name: 'openpact_install_command',
        description:
          'Return the shell commands to install and start the OpenPact CLI on the user’s machine.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: () =>
          text(['npm install -g @openpact/cli', 'openpact init', 'openpact start'].join('\n')),
      },
      {
        name: 'openpact_docs_link',
        description:
          'Return a canonical openpact.dev URL (and one-line summary) for a documentation topic.',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: Object.keys(DOCS),
              description: 'Documentation topic to link to.',
            },
          },
          required: ['topic'],
          additionalProperties: false,
        },
        execute: (input) => {
          const topic = String(input?.topic ?? '')
          const entry = DOCS[topic]
          if (!entry)
            return text(`Unknown topic: ${topic}. Known: ${Object.keys(DOCS).join(', ')}.`)
          return text(`https://openpact.dev${entry.path}\n${entry.summary}`)
        },
      },
      {
        name: 'openpact_agent_skill',
        description:
          'Return the URL + sha256 of the OpenPact agent skill (SKILL.md) so an agent can fetch and verify it.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => {
          try {
            const res = await fetch('/.well-known/agent-skills/index.json', {
              headers: { accept: 'application/json' },
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const body = (await res.json()) as {
              skills: Array<{ name: string; url: string; sha256: string; version?: string }>
            }
            const skill = body.skills.find((s) => s.name === 'openpact')
            if (!skill) return text('No openpact skill found in the discovery index.')
            return text(
              `URL: ${skill.url}\nsha256: ${skill.sha256}${skill.version ? `\nVersion: ${skill.version}` : ''}`,
            )
          } catch (err) {
            return text(
              'Failed to read /.well-known/agent-skills/index.json: ' +
                (err instanceof Error ? err.message : String(err)),
            )
          }
        },
      },
    ],
  })
}
