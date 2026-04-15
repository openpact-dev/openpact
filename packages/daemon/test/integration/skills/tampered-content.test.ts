/**
 * GET /v1/skills/:id/content must reject tampered local content with
 * 500 SKILL_CHECKSUM_MISMATCH. We can't easily corrupt the autobase
 * view from outside (it's owned by the apply function), so we exercise
 * the route handler against a stubbed daemon whose `view` yields a
 * pre-tampered entry. Same code path; lower-fidelity but isolates
 * exactly the verification logic we care about.
 */
import test from 'brittle'
import Fastify from 'fastify'
import { createHash } from 'crypto'
import skillsRoute from '../../../src/api/routes/skills'
import { errorHandler, envelope } from '../../../src/api/errors'

function sha(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}

function stubDaemon(entries: any[]) {
  return {
    view: {
      async *createReadStream(_range: any) {
        for (const value of entries) yield { key: `skill/${value.timestamp}/${value.id}`, value }
      },
    },
    peerHandle: 'anon-stub-0001',
    append: async () => ({ id: 'stub-1', timestamp: '2026-04-15T00:00:00Z' }),
  }
}

async function bootApi(t: any, daemon: any): Promise<string> {
  const app = Fastify({ logger: false })
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(envelope(404, 'NOT_FOUND', `route ${req.method} ${req.url} not found`))
  })
  await app.register(skillsRoute as any, { daemon })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = (app.server.address() as any).port
  t.teardown(() => app.close())
  return `http://127.0.0.1:${port}`
}

test('GET /v1/skills/:id/content detects tampered local content', async (t) => {
  const realContent = 'real, signed content'
  const realChecksum = sha(realContent)
  const tampered = {
    id: 'aaaa-1',
    type: 'skill',
    timestamp: '2026-04-15T00:00:00Z',
    agent_id: 'anon-stub-0001',
    payload: {
      name: 'integrity-test',
      version: '1.0.0',
      format: 'generic',
      content: 'i have been tampered with',
      checksum: realChecksum, // mismatched on purpose
    },
  }
  const url = await bootApi(t, stubDaemon([tampered]))
  const res = await fetch(`${url}/v1/skills/${tampered.id}/content`)
  t.is(res.status, 500)
  const body = (await res.json()) as { error: string }
  t.is(body.error, 'SKILL_CHECKSUM_MISMATCH')
})

test('GET /v1/skills/:id/content passes through when content matches checksum', async (t) => {
  const content = 'real, signed content'
  const good = {
    id: 'aaaa-2',
    type: 'skill',
    timestamp: '2026-04-15T00:00:00Z',
    agent_id: 'anon-stub-0001',
    payload: {
      name: 'integrity-test',
      version: '1.0.0',
      format: 'generic',
      content,
      checksum: sha(content),
    },
  }
  const url = await bootApi(t, stubDaemon([good]))
  const res = await fetch(`${url}/v1/skills/${good.id}/content`)
  t.is(res.status, 200)
  t.is(((await res.json()) as any).content, content)
})
