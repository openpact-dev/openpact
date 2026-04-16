/**
 * GET /v1/events back-pressure:
 *   - When the outbound Node stream buffer crosses
 *     OPENPACT_SSE_BUFFER_BYTES, the server closes the SSE socket
 *     rather than letting the buffer grow unbounded.
 *   - A `sse-backpressure-close` daemon event is emitted so
 *     supervisors / metrics endpoints can count slow consumers.
 *
 * We drive this through the real Fastify stack (so the route code is
 * exercised end-to-end) but interpose on the reply's raw socket to
 * simulate a slow consumer: `writableLength` is overridden to return
 * a value above the threshold after the first frame. That exercises
 * the exact branch without depending on kernel TCP buffer sizes,
 * which vary across OSes and are hard to pin down in CI.
 */
import test from 'brittle'
import { once } from 'events'
import http from 'http'
import { tmpDaemon } from '../../helpers/tmp-daemon'
import { createApi, bind } from '../../../src/api'

let nextPort = 23000

test('slow SSE consumer triggers sse-backpressure-close + socket tear-down', async (t) => {
  const prev = process.env.OPENPACT_SSE_BUFFER_BYTES
  process.env.OPENPACT_SSE_BUFFER_BYTES = '128'
  t.teardown(() => {
    if (prev === undefined) delete process.env.OPENPACT_SSE_BUFFER_BYTES
    else process.env.OPENPACT_SSE_BUFFER_BYTES = prev
  })

  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)

  // Patch reply.raw on the next request so writableLength reports
  // "above threshold" after the initial retry frame has been sent.
  // Hook must be registered before the server starts listening.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url !== '/v1/events') return
    const raw = reply.raw
    let calls = 0
    Object.defineProperty(raw, 'writableLength', {
      configurable: true,
      get() {
        // Report 0 on the first access (so the retry + first entry
        // frames are written) then 1024 bytes forever after — well
        // above the 128-byte test threshold.
        calls++
        return calls <= 1 ? 0 : 1024
      },
    })
  })

  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })
  t.teardown(() => app.close())

  // Open an SSE request. We intentionally don't read the body — we
  // only want to see the connection get torn down.
  const reqOpts: http.RequestOptions = {
    host: '127.0.0.1',
    port,
    path: '/v1/events',
    method: 'GET',
    headers: { accept: 'text/event-stream' },
  }
  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.request(reqOpts, resolve)
    req.on('error', reject)
    req.end()
  })
  t.is(res.statusCode, 200, 'SSE route returned 200')

  const backpressureFired = once(daemon, 'sse-backpressure-close')
  // Emit a pair of synthetic entries — the first gets written, the
  // second sees writableLength=1024 > threshold=128 and triggers the
  // guard.
  daemon.emit('entry-applied', {
    kind: 'knowledge',
    entry: { payload: { topic: 'bp', content: 'x' }, author: 'a'.repeat(64) },
    key: 'first',
    pactId: 'default',
    alias: 'default',
  })
  daemon.emit('entry-applied', {
    kind: 'knowledge',
    entry: { payload: { topic: 'bp', content: 'y' }, author: 'a'.repeat(64) },
    key: 'second',
    pactId: 'default',
    alias: 'default',
  })

  const [payload] = (await Promise.race([
    backpressureFired,
    new Promise((_, r) => setTimeout(() => r(new Error('no sse-backpressure-close event')), 5_000)),
  ])) as [{ pendingBytes: number; threshold: number }]

  t.is(payload.threshold, 128, 'threshold forwarded from env var')
  t.is(payload.pendingBytes, 1024, 'pendingBytes reported from raw stream')

  // Server should end the response; consume any buffered bytes.
  await new Promise<void>((resolve) => {
    res.resume()
    res.on('end', resolve)
    res.on('close', resolve)
  })
  t.pass('SSE socket closed after back-pressure')
})
