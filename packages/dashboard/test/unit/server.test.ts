/**
 * startDashboard boots a Fastify proxy + static server in front of a
 * running OpenPact daemon. These tests cover the wiring:
 *   - bind() respects the localhost whitelist
 *   - /api/* proxies to the daemon's /v1/*
 *   - missing static dir is OK (proxy still works for tests)
 *   - close() unbinds the port
 */
import test from 'brittle'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { Daemon, createApi, bind } from '@openpact/daemon'
import { startDashboard } from '../../server/index'

let nextDaemonPort = 24000

interface DaemonHarness {
  daemon: Daemon
  daemonPort: number
}

async function bootDaemon(t: any): Promise<DaemonHarness> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-dash-'))
  const daemon = await Daemon.create({ dataDir: dir })
  // await daemon.start() — skipped: no swarm needed for HTTP-only tests
  const app = createApi(daemon)
  const daemonPort = nextDaemonPort++
  await bind(app, { host: '127.0.0.1', port: daemonPort })
  t.teardown(async () => {
    await app.close()
    await daemon.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })
  return { daemon, daemonPort }
}

test('startDashboard rejects non-loopback hosts', async (t) => {
  await t.exception(() => startDashboard({ host: '0.0.0.0', port: 0 }), /must be 127.0.0.1/)
})

test('startDashboard binds an OS-chosen port when port: 0', async (t) => {
  const { daemonPort } = await bootDaemon(t)
  const dash = await startDashboard({ daemonPort, port: 0 })
  t.teardown(() => dash.close())
  t.ok(dash.port > 0, 'bound to a real port')
  t.is(typeof dash.url, 'string')
  t.ok(dash.url.startsWith('http://127.0.0.1:'))
})

test('GET /api/v1/ping proxies to the daemon and returns { ok: true }', async (t) => {
  const { daemonPort } = await bootDaemon(t)
  const dash = await startDashboard({ daemonPort, port: 0 })
  t.teardown(() => dash.close())

  // The SDK sends paths that already include /v1/; the proxy strips
  // only /api, so /api/v1/ping reaches the daemon at /v1/ping.
  const res = await fetch(`${dash.url}/api/v1/ping`)
  t.is(res.status, 200)
  t.alike(await res.json(), { ok: true })
})

test('GET /api/v1/pacts/default/knowledge proxies query strings through to the daemon', async (t) => {
  const { daemonPort } = await bootDaemon(t)
  const dash = await startDashboard({ daemonPort, port: 0 })
  t.teardown(() => dash.close())

  const post = await fetch(`${dash.url}/api/v1/pacts/default/knowledge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'wiring', content: 'proxy works' }),
  })
  t.is(post.status, 200)

  let arr: any[] = []
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${dash.url}/api/v1/pacts/default/knowledge?topic=wiring`)
    arr = ((await res.json()) as { entries: any[] }).entries
    if (arr.length >= 1) break
    await new Promise((r) => setTimeout(r, 50))
  }
  t.is(arr.length, 1)
  t.is(arr[0].payload.content, 'proxy works')
})

test('GET / returns 404 when no static dir is mounted (test default)', async (t) => {
  // Point staticDir at a directory we know doesn't exist; the server
  // skips the static mount, so / returns Fastify's default 404.
  const { daemonPort } = await bootDaemon(t)
  const dash = await startDashboard({
    daemonPort,
    port: 0,
    staticDir: '/tmp/openpact-dashboard-no-such-dir-' + Date.now(),
  })
  t.teardown(() => dash.close())

  const res = await fetch(dash.url)
  t.is(res.status, 404)
})

test('GET / serves index.html when staticDir contains one', async (t) => {
  const { daemonPort } = await bootDaemon(t)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-static-'))
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>hi</h1>\n')
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))

  const dash = await startDashboard({ daemonPort, port: 0, staticDir: dir })
  t.teardown(() => dash.close())

  const res = await fetch(dash.url + '/')
  t.is(res.status, 200)
  const body = await res.text()
  t.ok(body.includes('<h1>hi</h1>'))
})

test('close() unbinds the port', async (t) => {
  const { daemonPort } = await bootDaemon(t)
  const dash = await startDashboard({ daemonPort, port: 0 })
  await dash.close()

  let threw = false
  try {
    await fetch(dash.url + '/api/v1/ping')
  } catch {
    threw = true
  }
  t.ok(threw, 'fetch against the closed port rejects')
})

test('GET /api/v1/ping returns an upstream error when the daemon is unavailable', async (t) => {
  const dash = await startDashboard({ daemonPort: 65530, port: 0 })
  t.teardown(() => dash.close())

  const res = await fetch(`${dash.url}/api/v1/ping`)
  t.ok(res.status >= 500, `expected an upstream failure, got ${res.status}`)
})
