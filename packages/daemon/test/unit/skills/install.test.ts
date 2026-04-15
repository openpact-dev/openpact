/**
 * POST /v1/skills/:id/install + GET /v1/skills/installed.
 *
 * Security boundary: install root pinned at <dataDir>/skills/, name and
 * version validated server-side, file extension derived from the
 * format (never peer-supplied), checksum re-verified before write,
 * mode 0644, manifest written atomically.
 */
import test from 'brittle'
import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

function sha(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}

async function bootApi(t: any) {
  // No swarm needed for in-process route tests; skip start to save ~1s/test.
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())
  return { app, daemon }
}

async function postSkill(app: any, over: Record<string, unknown> = {}): Promise<{ id: string }> {
  const content = (over.content as string) ?? 'real content'
  const res = await app.inject({
    method: 'POST',
    url: '/v1/skills',
    payload: {
      name: 'scraper',
      version: '1.0.0',
      format: 'openclaw',
      content,
      checksum: sha(content),
      ...over,
    },
  })
  if (res.statusCode !== 200) throw new Error(`POST /v1/skills failed: ${res.body}`)
  return JSON.parse(res.body)
}

test('install: writes file under <dataDir>/skills/<name>@<version>.<ext> with mode 0644', async (t) => {
  const { app, daemon } = await bootApi(t)
  const { id } = await postSkill(app, { content: 'hello world' })

  const res = await app.inject({
    method: 'POST',
    url: `/v1/skills/${id}/install`,
    payload: { confirm: true },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.ok, true)

  const expected = path.join(daemon.dataDir, 'skills', 'scraper@1.0.0.md')
  t.is(body.path, expected)
  const stat = await fs.stat(expected)
  t.is(stat.mode & 0o777, 0o644, 'file mode is 0644')
  t.is(await fs.readFile(expected, 'utf8'), 'hello world')
})

test('install: missing { confirm: true } returns 400 NOT_CONFIRMED', async (t) => {
  const { app } = await bootApi(t)
  const { id } = await postSkill(app)

  const res = await app.inject({
    method: 'POST',
    url: `/v1/skills/${id}/install`,
    payload: { confirm: false },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'NOT_CONFIRMED')
})

test('install: bad name (path traversal) is rejected with 400 BAD_SKILL_NAME', async (t) => {
  const { app } = await bootApi(t)
  // The schema accepts long names; the install route enforces the
  // lowercase-alnum-dot-dash regex.
  const { id } = await postSkill(app, { name: '../../etc/passwd' })

  const res = await app.inject({
    method: 'POST',
    url: `/v1/skills/${id}/install`,
    payload: { confirm: true },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'BAD_SKILL_NAME')
})

test('install: each format gets the right extension', async (t) => {
  const { app, daemon } = await bootApi(t)
  for (const [format, ext] of [
    ['openclaw', 'md'],
    ['langchain', 'py'],
    ['generic', 'txt'],
  ] as const) {
    const { id } = await postSkill(app, {
      name: `s-${format}`,
      format,
      content: `content-${format}`,
    })
    const res = await app.inject({
      method: 'POST',
      url: `/v1/skills/${id}/install`,
      payload: { confirm: true },
    })
    t.is(res.statusCode, 200, `install ${format}`)
    const target = path.join(daemon.dataDir, 'skills', `s-${format}@1.0.0.${ext}`)
    await fs.access(target)
    t.pass(`installed at ${target}`)
  }
})

test('install: 404 when skill id is unknown', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/skills/zzzz-99/install',
    payload: { confirm: true },
  })
  t.is(res.statusCode, 404)
})

test('install: updates installed-skills.json atomically', async (t) => {
  const { app, daemon } = await bootApi(t)
  const { id } = await postSkill(app)
  await app.inject({
    method: 'POST',
    url: `/v1/skills/${id}/install`,
    payload: { confirm: true },
  })

  const manifest = JSON.parse(
    await fs.readFile(path.join(daemon.dataDir, 'installed-skills.json'), 'utf8'),
  )
  t.ok(manifest[id], 'entry id is the manifest key')
  t.is(manifest[id].name, 'scraper')
  t.is(manifest[id].version, '1.0.0')
  t.is(manifest[id].format, 'openclaw')
  t.is(manifest[id].checksum, sha('real content'))
  t.ok(manifest[id].installed_at, 'installed_at is set')

  // No leftover .tmp file
  const dir = await fs.readdir(daemon.dataDir)
  t.absent(
    dir.some((f) => f.endsWith('.tmp')),
    'no leftover .tmp file',
  )
})

test('GET /v1/skills/installed lists every installed skill', async (t) => {
  const { app } = await bootApi(t)
  const a = await postSkill(app, { name: 'a', content: 'aaa' })
  const b = await postSkill(app, { name: 'b', content: 'bbb' })

  await app.inject({
    method: 'POST',
    url: `/v1/skills/${a.id}/install`,
    payload: { confirm: true },
  })
  await app.inject({
    method: 'POST',
    url: `/v1/skills/${b.id}/install`,
    payload: { confirm: true },
  })

  const res = await app.inject({ method: 'GET', url: '/v1/skills/installed' })
  t.is(res.statusCode, 200)
  const installed = JSON.parse(res.body) as any[]
  t.is(installed.length, 2)
  t.ok(installed.some((s) => s.id === a.id && s.name === 'a'))
  t.ok(installed.some((s) => s.id === b.id && s.name === 'b'))
})

test('GET /v1/skills/installed returns [] when nothing has been installed', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({ method: 'GET', url: '/v1/skills/installed' })
  t.is(res.statusCode, 200)
  t.alike(JSON.parse(res.body), [])
})
