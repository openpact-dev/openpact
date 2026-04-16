/**
 * POST /v1/skills checksum verification + requires_approval round-trip.
 * Boots the api against a single tmp daemon — no swarm needed.
 */
import test from 'brittle'
import { createApi, bind } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'
import { listByType } from '../../../src/api/views'
import { skillChecksum } from '../../../src/skills'

function sha(content: string): string {
  return skillChecksum(content)
}

async function bootApi(t: any) {
  // No swarm needed for in-process route tests; skip start to save ~1s/test.
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  const url = await bind(app, { host: '127.0.0.1', port: 0 })
  t.teardown(() => app.close())
  return { url, daemon }
}

async function postJson(url: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

test('POST /v1/skills: correct checksum is accepted', async (t) => {
  const { url } = await bootApi(t)
  const content = 'hello'
  const res = await postJson(`${url}/v1/pacts/default/skills`, {
    name: 's',
    version: '1.0.0',
    format: 'generic',
    content,
    checksum: sha(content),
  })
  t.is(res.status, 200)
  t.ok(/^[0-9a-f]{8}-\d+$/.test(res.body.id))
})

test('POST /v1/skills: mismatched checksum returns 400 SKILL_CHECKSUM_MISMATCH', async (t) => {
  const { url } = await bootApi(t)
  const res = await postJson(`${url}/v1/pacts/default/skills`, {
    name: 's',
    version: '1.0.0',
    format: 'generic',
    content: 'hello',
    checksum: 'sha256:' + 'a'.repeat(64),
  })
  t.is(res.status, 400)
  t.is(res.body.error, 'SKILL_CHECKSUM_MISMATCH')
})

test('POST /v1/skills: requires_approval is preserved on the appended entry', async (t) => {
  const { url, daemon } = await bootApi(t)
  const content = 'careful with this one'
  const res = await postJson(`${url}/v1/pacts/default/skills`, {
    name: 'dangerous',
    version: '1.0.0',
    format: 'generic',
    content,
    checksum: sha(content),
    requires_approval: true,
  })
  t.is(res.status, 200)
  const page = await listByType(daemon.view, 'skill', { limit: 10 })
  t.is(page.entries.length, 1)
  const entry = page.entries[0] as { payload: { requires_approval: boolean } }
  t.is(entry.payload.requires_approval, true, 'requires_approval round-trips')
})
