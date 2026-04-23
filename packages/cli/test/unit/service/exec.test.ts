import test from 'brittle'
import { run } from '../../../src/lib/service/exec'

test('run: captures stdout on success', async (t) => {
  const res = await run('node', ['-e', "process.stdout.write('hello')"])
  t.is(res.code, 0)
  t.is(res.stdout, 'hello')
})

test('run: returns non-zero code and stderr when command fails', async (t) => {
  const res = await run('node', ['-e', "process.stderr.write('bad'); process.exit(7)"])
  t.is(res.code, 7)
  t.ok(res.stderr.includes('bad'))
})

test('run: throws ENOENT-shaped error when the binary is missing', async (t) => {
  await t.exception(
    () => run('/no/such/binary-openpact-tests-' + Date.now(), []),
    /command not found/,
  )
})
