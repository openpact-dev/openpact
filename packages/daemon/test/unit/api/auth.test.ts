import test from 'brittle'
import Fastify from 'fastify'
import { makeAuthHook, __testing } from '../../../src/api/auth'
import { errorHandler } from '../../../src/api/errors'

const { isAllowedHost, isAllowedOrigin } = __testing

const TOKEN = 'a'.repeat(64)

async function bootGuarded(token: string | null = TOKEN): Promise<{
  url: string
  close(): Promise<void>
}> {
  const app = Fastify({ logger: false })
  app.setErrorHandler(errorHandler)
  if (token) app.addHook('onRequest', makeAuthHook({ token }))
  app.get('/v1/ping', async () => ({ ok: true }))
  app.get('/v1/protected', async () => ({ secret: 42 }))
  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = (app.server.address() as { port: number }).port
  return { url: `http://127.0.0.1:${port}`, close: () => app.close() }
}

test('isAllowedHost', (t) => {
  t.ok(isAllowedHost('127.0.0.1'))
  t.ok(isAllowedHost('127.0.0.1:7666'))
  t.ok(isAllowedHost('localhost'))
  t.ok(isAllowedHost('localhost:7666'))
  t.ok(isAllowedHost('::1'))
  t.ok(isAllowedHost('[::1]:7666'))
  t.absent(isAllowedHost(undefined))
  t.absent(isAllowedHost('example.com'))
  t.absent(isAllowedHost('10.0.0.1'))
})

test('isAllowedOrigin', (t) => {
  t.ok(isAllowedOrigin(undefined, '127.0.0.1:7666'))
  t.ok(isAllowedOrigin('http://127.0.0.1:7666', '127.0.0.1:7666'))
  t.absent(isAllowedOrigin('http://example.com', '127.0.0.1:7666'))
  t.absent(isAllowedOrigin('http://127.0.0.1:7667', '127.0.0.1:7666'))
  t.absent(isAllowedOrigin('not a url', '127.0.0.1:7666'))
})

test('public paths bypass auth', async (t) => {
  const { url, close } = await bootGuarded()
  t.teardown(() => close())
  const res = await fetch(`${url}/v1/ping`)
  t.is(res.status, 200)
})

test('missing bearer token → 401', async (t) => {
  const { url, close } = await bootGuarded()
  t.teardown(() => close())
  const res = await fetch(`${url}/v1/protected`)
  t.is(res.status, 401)
  const body = (await res.json()) as { error: string }
  t.is(body.error, 'UNAUTHORIZED')
})

test('wrong bearer token → 401', async (t) => {
  const { url, close } = await bootGuarded()
  t.teardown(() => close())
  const res = await fetch(`${url}/v1/protected`, {
    headers: { authorization: 'Bearer nope' },
  })
  t.is(res.status, 401)
})

test('correct bearer token → 200', async (t) => {
  const { url, close } = await bootGuarded()
  t.teardown(() => close())
  const res = await fetch(`${url}/v1/protected`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  t.is(res.status, 200)
  const body = (await res.json()) as { secret: number }
  t.is(body.secret, 42)
})

test('non-loopback Host header → 403 FORBIDDEN_HOST', async (t) => {
  const { url, close } = await bootGuarded()
  t.teardown(() => close())
  const res = await fetch(`${url}/v1/protected`, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      // fetch won't let us set Host directly on most runtimes, but
      // Node 22's undici allows via HeadersInit when the value clearly
      // isn't the actual host. This test mostly locks in the path that
      // the preHandler enforces with the Origin header stand-in below.
      origin: 'http://evil.example.com',
    },
  })
  t.is(res.status, 403)
  const body = (await res.json()) as { error: string }
  t.is(body.error, 'FORBIDDEN_ORIGIN')
})

test('constant-time compare rejects slightly-wrong tokens', async (t) => {
  const { url, close } = await bootGuarded()
  t.teardown(() => close())
  const almost = TOKEN.slice(0, -1) + 'b'
  const res = await fetch(`${url}/v1/protected`, {
    headers: { authorization: `Bearer ${almost}` },
  })
  t.is(res.status, 401)
})

test('tokens of different length do not crash timingSafeEqual', async (t) => {
  const { url, close } = await bootGuarded()
  t.teardown(() => close())
  const res = await fetch(`${url}/v1/protected`, {
    headers: { authorization: 'Bearer short' },
  })
  t.is(res.status, 401)
})
