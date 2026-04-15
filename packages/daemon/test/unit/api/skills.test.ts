import test from 'brittle'
import { createHash } from 'crypto'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

function sha(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}

function skillBody(over: Record<string, unknown> = {}) {
  const content = (over.content as string) ?? 'hello world'
  return {
    name: 'scraper',
    version: '1.0.0',
    format: 'openclaw',
    content,
    checksum: sha(content),
    ...over,
  }
}

test('POST /v1/skills: each format passes', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  for (const format of ['openclaw', 'langchain', 'generic']) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/skills',
      payload: skillBody({ format, name: `skill-${format}` }),
    })
    t.is(res.statusCode, 200, `format=${format}`)
  }
})

test('POST /v1/skills: missing checksum returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { checksum, ...without } = skillBody()
  void checksum
  const res = await app.inject({
    method: 'POST',
    url: '/v1/skills',
    payload: without,
  })
  t.is(res.statusCode, 400)
})

test('POST /v1/skills: bad checksum format returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/skills',
    payload: skillBody({ checksum: 'md5:abc' }),
  })
  t.is(res.statusCode, 400)
})

test('GET /v1/skills: filter by format', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await app.inject({ method: 'POST', url: '/v1/skills', payload: skillBody({ name: 'a' }) })
  await app.inject({
    method: 'POST',
    url: '/v1/skills',
    payload: skillBody({ name: 'b', format: 'langchain' }),
  })
  await daemon.update()
  await daemon.waitForViewVersion(2, { timeout: 2000 })

  const res = await app.inject({ method: 'GET', url: '/v1/skills?format=openclaw' })
  const entries = JSON.parse(res.body) as any[]
  t.is(entries.length, 1)
  t.is(entries[0].payload.name, 'a')
})

test('GET /v1/skills: invalid format returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/skills?format=autogen' })
  t.is(res.statusCode, 400)
})

test('GET /v1/skills/:id/content: returns content', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const post = await app.inject({
    method: 'POST',
    url: '/v1/skills',
    payload: skillBody({ name: 'c', content: 'real content' }),
  })
  const { id } = JSON.parse(post.body)
  await daemon.update()
  await daemon.waitForViewVersion(1, { timeout: 2000 })

  const res = await app.inject({ method: 'GET', url: `/v1/skills/${id}/content` })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.content, 'real content')
  t.is(body.checksum, sha('real content'))
})

test('GET /v1/skills/:id/content: 404 when unknown', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/skills/abcd-99/content' })
  t.is(res.statusCode, 404)
  t.is(JSON.parse(res.body).error, 'NOT_FOUND')
})
