import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { skillsResource } from '../../src/resources/skills'
import { NotFoundError } from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

const SHA = 'sha256:' + 'a'.repeat(64)

test('skills.list: filters by format', async (t) => {
  const m = mockFetch({ status: 200, body: [] })
  const r = skillsResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.list({ format: 'openclaw' })
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/skills?format=openclaw')
})

test('skills.create: POSTs full payload incl. checksum', async (t) => {
  const m = mockFetch({ status: 200, body: { id: 'aaaa-1', timestamp: 'now' } })
  const r = skillsResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.create({
    name: 'scraper',
    version: '1.0.0',
    format: 'openclaw',
    content: 'hi',
    checksum: SHA,
  })
  const body = JSON.parse(m.calls[0].body!)
  t.is(body.name, 'scraper')
  t.is(body.checksum, SHA)
})

test('skills.getContent: returns full content body', async (t) => {
  const m = mockFetch({
    status: 200,
    body: {
      id: 'aaaa-1',
      name: 'x',
      version: '1',
      format: 'openclaw',
      checksum: SHA,
      content: 'BODY',
    },
  })
  const r = skillsResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.getContent('aaaa-1')
  t.is(res.content, 'BODY')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/skills/aaaa-1/content')
})

test('skills.getContent: 404 → NotFoundError', async (t) => {
  const m = mockFetch({ status: 404, body: { error: 'NOT_FOUND', message: 'no skill' } })
  const r = skillsResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.getContent('zzzz-9'), NotFoundError)
})
