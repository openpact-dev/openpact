import test from 'brittle'
import { runWithDir, tmpHome, authHeaders } from './helpers/run-cli'
import { bootPact, getFreePort } from './helpers/boot-pact'

test('message: broadcasts a short message and prints entry id', async (t) => {
  const { home, port, base } = await bootPact(t)
  const res = await runWithDir(
    home,
    ['message', 'starting refactor of src/router/*', '--port', String(port)],
    { reject: true },
  )
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Broadcast'))

  await new Promise((r) => setTimeout(r, 300))
  const headers = await authHeaders(home)
  const msgs = await fetch(`${base}/v1/pacts/default/messages`, { headers }).then((r) => r.json())
  t.ok(msgs.entries.some((m: any) => m.payload.content === 'starting refactor of src/router/*'))
})

test('message: rejects empty content and unknown priority', async (t) => {
  const { home, port } = await bootPact(t)
  const empty = await runWithDir(home, ['message', '   ', '--port', String(port)])
  t.not(empty.exitCode, 0)
  t.ok(empty.stderr.includes('must not be empty'))

  const badPri = await runWithDir(home, [
    'message',
    'hi',
    '--priority',
    'urgent',
    '--port',
    String(port),
  ])
  t.not(badPri.exitCode, 0)
  t.ok(badPri.stderr.includes('unknown priority'))
})

test('message: daemon not running → exit 1 with clear error', async (t) => {
  const home = await tmpHome(t)
  const port = await getFreePort()
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })
  const res = await runWithDir(home, ['message', 'hello', '--port', String(port)])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('not running'))
})
