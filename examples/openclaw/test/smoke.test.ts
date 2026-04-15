/**
 * Two checks:
 *   1. workspace/SKILL.md is byte-identical to the canonical
 *      @openpact/skill SKILL.md (drift guard).
 *   2. Every tool listed in the workspace SKILL.md frontmatter
 *      hits a real daemon endpoint that exists.
 *
 * We can't bring in a real OpenClaw runtime as a build-time dep,
 * so this is a static + REST-level test. Real-OpenClaw smoke is
 * documented in the README.
 */
import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Daemon, createApi, bind } from '@openpact/daemon'
import { createHash } from 'crypto'

const ROOT = path.resolve(__dirname, '..')
const WORKSPACE_SKILL = path.join(ROOT, 'workspace', 'SKILL.md')
const SKILL_PKG_DIR = path.dirname(require.resolve('@openpact/skill/package.json'))
const CANONICAL_SKILL = path.join(SKILL_PKG_DIR, 'SKILL.md')
const TOOLS_JSON = path.join(SKILL_PKG_DIR, 'tools.json')

let nextPort = 21100

interface Tool {
  name: string
  method: string
  path: string
  query?: Record<string, unknown>
  body?: Record<string, unknown>
  params?: Record<string, unknown>
}

async function bootDaemon(t: any): Promise<{ base: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-openclaw-'))
  const daemon = await Daemon.create({ dataDir: dir })
  await daemon.start()
  const app = createApi(daemon)
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })
  t.teardown(async () => {
    await app.close()
    await daemon.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })
  return { base: `http://127.0.0.1:${port}` }
}

async function call(
  base: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(base + url, init)
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed }
}

async function waitFor<T>(
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T
  while (Date.now() < deadline) {
    last = await fn()
    if (ok(last)) return last
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('waitFor timeout; last value: ' + JSON.stringify(last!))
}

test('workspace/SKILL.md is byte-identical to the canonical @openpact/skill', async (t) => {
  const a = await fs.readFile(WORKSPACE_SKILL, 'utf8')
  const b = await fs.readFile(CANONICAL_SKILL, 'utf8')
  t.is(a, b, 'workspace SKILL.md drift; re-copy from @openpact/skill')
})

test('every tool in the workspace skill hits a live daemon endpoint', async (t) => {
  const { base } = await bootDaemon(t)
  const tools = (JSON.parse(await fs.readFile(TOOLS_JSON, 'utf8')) as { tools: Tool[] }).tools

  // Seed a knowledge entry, a task, a skill, and a message so the
  // GET-by-id and PUT lifecycle tools have real ids to chase.
  const k = await call(base, 'POST', '/v1/knowledge', {
    topic: 'wiring',
    content: 'openclaw smoke',
  })
  const knowledgeId: string = k.body.id

  const taskCreate = await call(base, 'POST', '/v1/tasks', { title: 'openclaw-smoke' })
  const taskId: string = taskCreate.body.id

  const skillContent = 'sample'
  const skillChecksum = 'sha256:' + createHash('sha256').update(skillContent, 'utf8').digest('hex')
  const skillCreate = await call(base, 'POST', '/v1/skills', {
    name: 's',
    version: '1.0.0',
    format: 'openclaw',
    content: skillContent,
    checksum: skillChecksum,
  })
  const skillId: string = skillCreate.body.id

  await call(base, 'POST', '/v1/messages', { to: '*', content: 'hi' })

  await waitFor(
    async () => (await call(base, 'GET', '/v1/tasks?status=open')).body,
    (arr) => Array.isArray(arr) && arr.some((tt: any) => tt.id === taskId),
  )

  // Skip destructive admin tools (need an indexer cap that a fresh
  // creator daemon doesn't have a peer key for) and release_task
  // (only legal mid-lifecycle).
  const skip = new Set(['grant_writer', 'revoke_writer', 'release_task'])

  for (const tool of tools) {
    if (skip.has(tool.name)) continue

    let url = tool.path
    if (url.includes(':id')) {
      if (tool.path.startsWith('/v1/tasks/')) url = url.replace(':id', taskId)
      else if (tool.path.startsWith('/v1/skills/')) url = url.replace(':id', skillId)
      else if (tool.path.startsWith('/v1/entries/')) url = url.replace(':id', knowledgeId)
    }

    let body: unknown | undefined
    if (tool.method !== 'GET' && tool.body) {
      if (tool.name === 'record_knowledge') body = { topic: 'wiring', content: 'redo' }
      else if (tool.name === 'create_task') body = { title: 'redo' }
      else if (tool.name === 'complete_task') body = { result: 'done' }
      else if (tool.name === 'send_message') body = { to: '*', content: 'redo' }
      else if (tool.name === 'install_skill') body = { confirm: true }
      else if (tool.name === 'share_skill') {
        const c = 'redo-openclaw'
        body = {
          name: 'redo-openclaw',
          version: '1.0.0',
          format: 'generic',
          content: c,
          checksum: 'sha256:' + createHash('sha256').update(c, 'utf8').digest('hex'),
        }
      }
    }

    const res = await call(base, tool.method, url, body)
    t.ok(
      res.status === 200 || res.status === 409,
      `${tool.method} ${url} (${tool.name}): got ${res.status}, expected 200 or documented 409`,
    )
  }
})
