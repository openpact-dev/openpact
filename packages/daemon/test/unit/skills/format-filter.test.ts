/**
 * Format filter on GET /v1/skills.
 */
import test from 'brittle'
import { createHash } from 'crypto'
import { createApi, bind } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

function sha(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}

async function bootApi(t: any) {
  // No swarm needed for in-process route tests; skip start to save ~1s/test.
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  const url = await bind(app, { host: '127.0.0.1', port: 0 })
  t.teardown(() => app.close())
  return { url, daemon }
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function waitForListLen(url: string, expected: number, timeoutMs = 3000): Promise<any[]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(url)
    const arr = (await res.json()) as any[]
    if (arr.length === expected) return arr
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('list length never reached ' + expected)
}

test('GET /v1/skills?format=openclaw filters by format', async (t) => {
  const { url } = await bootApi(t)

  // Seed one of each format.
  for (const format of ['openclaw', 'langchain', 'generic'] as const) {
    const content = `content-${format}`
    const r = await postJson(`${url}/v1/skills`, {
      name: `skill-${format}`,
      version: '1.0.0',
      format,
      content,
      checksum: sha(content),
    })
    t.is(r.status, 200)
  }

  await waitForListLen(`${url}/v1/skills`, 3)

  for (const format of ['openclaw', 'langchain', 'generic'] as const) {
    const res = await fetch(`${url}/v1/skills?format=${format}`)
    const arr = (await res.json()) as any[]
    t.is(arr.length, 1, `${format}: one match`)
    t.is(arr[0].payload.format, format)
  }
})

test('GET /v1/skills?format=bogus is rejected by the schema', async (t) => {
  const { url } = await bootApi(t)
  const res = await fetch(`${url}/v1/skills?format=autogen`)
  t.is(res.status, 400, 'unknown format value rejected')
})
