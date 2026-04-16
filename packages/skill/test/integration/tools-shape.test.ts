/**
 * Static checks on tools.json shape and SKILL.md ↔ tools.json drift.
 * No daemon needed; pure file inspection.
 */
import test from 'brittle'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..', '..')
const TOOLS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools.json'), 'utf8')) as {
  tools: Array<{ name: string; description: string; method: string; path: string }>
  runtime: { base_url: string; env: string }
  errors: { envelope: string; codes: Array<{ status: number; code: string; meaning: string }> }
}
const SKILL = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8')

const VALID_METHODS = ['GET', 'POST', 'PUT', 'DELETE']

test('tools.json: every tool has name/description/method/path', (t) => {
  for (const tool of TOOLS.tools) {
    t.ok(tool.name && tool.name.length > 0, `${tool.name}: has name`)
    t.ok(tool.description && tool.description.length >= 20, `${tool.name}: real description`)
    t.ok(VALID_METHODS.includes(tool.method), `${tool.name}: valid HTTP method`)
    t.ok(tool.path?.startsWith('/v1/'), `${tool.name}: v1 REST path`)
  }
})

test('tools.json: tool names are unique', (t) => {
  const names = TOOLS.tools.map((tt) => tt.name)
  t.is(new Set(names).size, names.length, 'no duplicate tool names')
})

test('tools.json: runtime env + base_url match the project default', (t) => {
  t.is(TOOLS.runtime.env, 'OPENPACT_URL')
  t.is(TOOLS.runtime.base_url, 'http://127.0.0.1:7666')
})

test('tools.json: error codes cover every documented daemon error', (t) => {
  const codes = TOOLS.errors.codes.map((c) => c.code)
  for (const required of [
    'BAD_REQUEST',
    'NOT_FOUND',
    'TASK_NOT_OPEN',
    'TASK_ALREADY_COMPLETE',
    'NOT_CLAIMER',
    'NOT_CLAIMED',
    'NOT_A_MEMBER',
    'INTERNAL',
  ]) {
    t.ok(codes.includes(required), `errors.codes includes ${required}`)
  }
})

test('SKILL.md ↔ tools.json: every tool name appears in SKILL.md frontmatter', (t) => {
  for (const tool of TOOLS.tools) {
    t.ok(SKILL.includes(`name: ${tool.name}`), `SKILL.md mentions tool ${tool.name}`)
  }
})

test('SKILL.md: starts with YAML frontmatter delimiters', (t) => {
  t.ok(SKILL.startsWith('---\n'), 'opens with ---')
  t.ok(SKILL.indexOf('\n---\n', 4) > 0, 'closes the frontmatter block')
})

test('SKILL.md: includes the canonical OPENPACT_URL convention', (t) => {
  t.ok(SKILL.includes('http://127.0.0.1:7666'), 'documents the default base URL')
  t.ok(SKILL.includes('OPENPACT_URL'), 'documents the env override')
})
