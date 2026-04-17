import test from 'brittle'
import { runWithDir, authHeaders } from './helpers/run-cli'
import { bootPact } from './helpers/boot-pact'

test('record: persists knowledge with topic and prints id', async (t) => {
  const { home, port, base } = await bootPact(t)
  const res = await runWithDir(
    home,
    [
      'record',
      'Use the resolver factory in src/router.ts',
      '--topic',
      'routing',
      '--source',
      'src/router.ts',
      '--port',
      String(port),
    ],
    { reject: true },
  )
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Recorded'))
  t.ok(res.stdout.includes('routing'))

  await new Promise((r) => setTimeout(r, 300))
  const headers = await authHeaders(home)
  const know = await fetch(`${base}/v1/pacts/default/knowledge?topic=routing`, { headers }).then(
    (r) => r.json(),
  )
  t.is(know.entries.length, 1)
  t.is(know.entries[0].payload.content, 'Use the resolver factory in src/router.ts')
  t.is(know.entries[0].payload.source, 'src/router.ts')
})

test('record: requires --topic', async (t) => {
  const { home, port } = await bootPact(t)
  const missingTopic = await runWithDir(home, ['record', 'something', '--port', String(port)])
  t.not(missingTopic.exitCode, 0)
  // Commander's `requiredOption` emits a "required option" error.
  t.ok(/required option|--topic/.test(missingTopic.stderr))
})
