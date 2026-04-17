#!/usr/bin/env node
// Copy SKILL.md + tools.json from @openpact/skill into the site's
// /.well-known/agent-skills/openpact/ directory, then regenerate the
// discovery index with fresh sha256 digests. Run as prebuild/predev
// so the published skill files and their pinned hashes never drift.

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(here, '..')
const skillDir = resolve(siteRoot, '..', 'skill')
const outDir = resolve(siteRoot, 'public', '.well-known', 'agent-skills')
const openpactOut = resolve(outDir, 'openpact')

const sources = [
  { from: resolve(skillDir, 'SKILL.md'), to: resolve(openpactOut, 'SKILL.md'), name: 'SKILL.md' },
  {
    from: resolve(skillDir, 'tools.json'),
    to: resolve(openpactOut, 'tools.json'),
    name: 'tools.json',
  },
]

await mkdir(openpactOut, { recursive: true })

const digests = {}
for (const { from, to, name } of sources) {
  const bytes = await readFile(from)
  await copyFile(from, to)
  digests[name] = createHash('sha256').update(bytes).digest('hex')
}

// Authoritative skill version lives in SKILL.md's YAML frontmatter
// (a content version that evolves independently of the npm package).
const skillText = await readFile(resolve(skillDir, 'SKILL.md'), 'utf8')
const frontmatterMatch = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/)
if (!frontmatterMatch) {
  throw new Error('agent-skills: SKILL.md is missing YAML frontmatter')
}
const versionMatch = frontmatterMatch[1].match(/^version:\s*(.+?)\s*$/m)
if (!versionMatch) {
  throw new Error('agent-skills: SKILL.md frontmatter has no `version:` field')
}
const skillVersion = versionMatch[1].replace(/^['"]|['"]$/g, '')

const index = {
  $schema: 'https://agentskills.io/schemas/v0.2.0/index.json',
  version: '0.2.0',
  skills: [
    {
      name: 'openpact',
      version: skillVersion,
      type: 'text/markdown',
      description:
        'Use a local OpenPact daemon as shared, append-only memory across agent sessions. Read prior decisions before acting, record non-obvious calls, coordinate work via tasks, broadcast status messages.',
      url: 'https://openpact.dev/.well-known/agent-skills/openpact/SKILL.md',
      sha256: digests['SKILL.md'],
    },
    {
      name: 'openpact-tools',
      version: skillVersion,
      type: 'application/json',
      description:
        'Tool declarations (JSON Schema) for every OpenPact daemon action. Consumable by OpenClaw, LangChain, and MCP clients that load JSON tool specs.',
      url: 'https://openpact.dev/.well-known/agent-skills/openpact/tools.json',
      sha256: digests['tools.json'],
    },
  ],
}

await writeFile(resolve(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')

console.log(
  `agent-skills: synced ${sources.length} file(s) to public/.well-known/agent-skills/openpact/`,
)
