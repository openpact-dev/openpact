/**
 * Drive every tool in tools.json against a real daemon. If a tool's
 * method/path drifts from what the daemon accepts, this fails — the
 * skill (which both SKILL.md and tools.json describe) can't silently
 * rot.
 */
import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Daemon, createApi, bind } from '@openpact/daemon'

const TOOLS = JSON.parse(
  require('fs').readFileSync(path.resolve(__dirname, '..', '..', 'tools.json'), 'utf8'),
) as {
  tools: Array<{
    name: string
    method: string
    path: string
    query?: Record<string, unknown>
    body?: Record<string, unknown>
    params?: Record<string, unknown>
  }>
}

let nextPort = 20000

interface Env {
  base: string
}

async function bootDaemon(t: any): Promise<Env> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-skill-'))
  const daemon = await Daemon.create({ dataDir: dir })
  // await daemon.start() — skipped: no swarm needed for HTTP-only tests
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

test('every tool in tools.json hits a live daemon endpoint that exists', async (t) => {
  const { base } = await bootDaemon(t)

  // Seed a knowledge entry, a task, a skill, and a message so the
  // GET-by-id and PUT lifecycle tools have a real id to chase.
  const k = await call(base, 'POST', '/v1/pacts/default/knowledge', {
    topic: 'wiring',
    content: 'tools.json drove this',
  })
  t.is(k.status, 200)
  const knowledgeId: string = k.body.id

  const taskCreate = await call(base, 'POST', '/v1/pacts/default/tasks', {
    title: 'tools-json-task',
  })
  t.is(taskCreate.status, 200)
  const taskId: string = taskCreate.body.id

  const { skillChecksum } = await import('@openpact/daemon')
  const skillContent = 'x'
  const SHA = skillChecksum(skillContent)
  const skillCreate = await call(base, 'POST', '/v1/pacts/default/skills', {
    name: 's',
    version: '1.0.0',
    format: 'generic',
    content: skillContent,
    checksum: SHA,
  })
  t.is(skillCreate.status, 200)
  const skillId: string = skillCreate.body.id

  await call(base, 'POST', '/v1/pacts/default/messages', { content: 'hi' })

  await waitFor(
    async () => (await call(base, 'GET', '/v1/pacts/default/tasks?status=open')).body,
    (page) => Array.isArray(page?.entries) && page.entries.some((tt: any) => tt.id === taskId),
  )

  // Walk every tool. For tools with `:id` params, substitute the
  // appropriate seeded id. Skip the destructive admin tools — they
  // require an indexer cap that a fresh creator daemon doesn't have a
  // peer key for.
  const skip = new Set(['grant_member', 'revoke_member', 'release_task'])

  for (const tool of TOOLS.tools) {
    if (skip.has(tool.name)) continue

    let url = tool.path
    // Substitute :pactId first so later :id substitutions have a stable path.
    if (url.includes(':pactId')) {
      url = url.replace(':pactId', 'default')
    }
    if (url.includes(':id')) {
      if (url.includes('/tasks/')) url = url.replace(':id', taskId)
      else if (url.includes('/skills/')) url = url.replace(':id', skillId)
      else if (url.includes('/entries/')) url = url.replace(':id', knowledgeId)
    }

    let body: unknown | undefined
    if (tool.method !== 'GET' && tool.body) {
      // Reuse the same shapes we seeded with; daemon validates schemas
      // so a wrong key would 400 and fail the test.
      if (tool.name === 'record_knowledge') body = { topic: 'wiring', content: 'redo' }
      else if (tool.name === 'create_task') body = { title: 'redo' }
      else if (tool.name === 'complete_task') body = { result: 'done' }
      else if (tool.name === 'send_message') body = { content: 'redo' }
      else if (tool.name === 'install_skill') body = { confirm: true }
      else if (tool.name === 'share_skill') {
        const c = 'redo-content'
        body = {
          name: 'redo',
          version: '1.0.0',
          format: 'generic',
          content: c,
          checksum: skillChecksum(c),
        }
      }
    }

    const res = await call(base, tool.method, url, body)
    t.ok(
      res.status === 200 || res.status === 409,
      `${tool.method} ${url} (${tool.name}): got ${res.status}, expected 200 or a documented 409 conflict`,
    )
  }
})

test('lost claim race surfaces the documented TASK_NOT_OPEN 409', async (t) => {
  const { base } = await bootDaemon(t)
  const created = await call(base, 'POST', '/v1/pacts/default/tasks', { title: 'race' })
  const id = created.body.id
  await waitFor(
    async () => (await call(base, 'GET', '/v1/pacts/default/tasks?status=open')).body,
    (page) => Array.isArray(page?.entries) && page.entries.some((tt: any) => tt.id === id),
  )
  await call(base, 'PUT', `/v1/pacts/default/tasks/${id}/claim`)
  const second = await call(base, 'PUT', `/v1/pacts/default/tasks/${id}/claim`)
  t.is(second.status, 409, 'second claim is a documented conflict')
  t.is(second.body.error, 'TASK_NOT_OPEN', 'envelope code matches tools.json')
})
