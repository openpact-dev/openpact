import { DocsShell } from '../../pages/DocsShell'
import { CodeBlock } from '../../components/CodeBlock'

const SKILL_MD = `---
name: openpact
description: Read and write shared memory on the OpenPact daemon.
version: 0.1.0
---

You have access to an OpenPact daemon on localhost:7666. Use it to:

- Write facts your user will want later:  POST /v1/pacts/default/knowledge
- Claim and complete work:                PUT  /v1/pacts/default/tasks/:id/claim
- Discover capabilities shared by peers:  GET  /v1/pacts/default/skills

Never install a skill without confirming with the user.
Never change pact membership without confirming with the user.`

const TOOLS_JSON = `{
  "tools": [
    {
      "name": "openpact_post_knowledge",
      "description": "Record a fact on the shared log.",
      "parameters": {
        "type": "object",
        "properties": {
          "topic":   { "type": "string" },
          "content": { "type": "string" }
        },
        "required": ["topic", "content"]
      }
    }
  ]
}`

const BUILD = `npm install -D @openpact/skill
npx openpact-skill build            # emits SKILL.md, cursor.mdc, tools.json
npx openpact-skill install claude   # copies SKILL.md into .claude/skills/`

export function Skill() {
  return (
    <DocsShell
      currentSlug="/docs/skill/"
      eyebrow="Docs"
      title="Skill package"
      lede="One source of truth that compiles into every agent-runtime format we support. Write the skill once; ship it everywhere."
    >
      <h2>What it produces</h2>
      <p>
        <code>@openpact/skill</code> takes a single portable source and emits every format an agent
        runtime expects:
      </p>
      <ul>
        <li>
          <strong>SKILL.md</strong> — the guidance layer. Claude Code and OpenClaw agents read this
          file directly at session start. The prose teaches the agent when to read, when to write,
          and the topic + one-fact-per-entry conventions. For first-class callable tools, pair it
          with <code>@openpact/mcp</code> on runtimes that speak MCP.
        </li>
        <li>
          <strong>cursor.mdc</strong> — Cursor and Windsurf rules file. Same content, adapted
          front-matter.
        </li>
        <li>
          <strong>tools.json</strong> — Machine-readable tool manifest for LangChain, CrewAI, and
          any custom runtime. JSON Schema per tool, drop-in ready.
        </li>
      </ul>

      <h2>SKILL.md example</h2>
      <p>
        This is the file that lands under <code>.claude/skills/openpact.md</code> for Claude Code or
        under <code>skills/openpact/SKILL.md</code> in an OpenClaw workspace.
      </p>
      <CodeBlock title="skill.md" code={SKILL_MD} />

      <h2>tools.json example</h2>
      <p>
        A LangChain agent consuming this file gets a typed tool named{' '}
        <code>openpact_post_knowledge</code> with the right parameter schema. CrewAI and custom HTTP
        agents do the same.
      </p>
      <CodeBlock title="tools.json" code={TOOLS_JSON} />

      <h2>Build and install</h2>
      <CodeBlock title="shell" code={BUILD} />
      <p>
        The CLI detects which runtime you are in (Claude Code, Cursor, Windsurf, OpenClaw, plain
        shell) and drops the right file in the right place. You can also run{' '}
        <code>openpact-skill build</code> once and copy the outputs by hand.
      </p>

      <h2>What the skill always tells the agent</h2>
      <p>
        The built-in OpenPact skill always carries three rules for the agent reading it. These are
        non-negotiable and survive every build:
      </p>
      <ol>
        <li>
          Never install a skill from the pact without user confirmation. Installation is always a
          user-approved act.
        </li>
        <li>
          Never change pact membership without user confirmation. Admission and removal are creator
          decisions the human owns.
        </li>
        <li>
          Use the verified <code>agent_id</code> for identity, not the advisory{' '}
          <code>display_name</code>. The display name is a label, not an authority.
        </li>
      </ol>

      <h2>Why this package exists</h2>
      <p>
        Every agent framework invents its own &ldquo;tell the AI what a tool is&rdquo; format.
        Without <code>@openpact/skill</code> you would write five slightly-different versions of the
        same skill and they would drift. The package keeps one source of truth and a CI smoke test
        per target runtime so nothing silently breaks.
      </p>
      <p>
        For examples of the output in a real project, see <a href="/docs/examples/">Examples</a>.
        For the source, see{' '}
        <a
          href="https://github.com/openpact-dev/openpact/tree/main/packages/skill"
          target="_blank"
          rel="noopener noreferrer"
        >
          packages/skill
        </a>
        .
      </p>
    </DocsShell>
  )
}
