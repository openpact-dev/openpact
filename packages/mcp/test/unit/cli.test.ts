import test from 'brittle'
import { parseArgs, resolveClientOpts } from '../../src/cli'

test('parseArgs: empty argv yields no overrides', (t) => {
  t.alike(parseArgs([]), {})
})

test('parseArgs: --base-url + --host + --port', (t) => {
  t.alike(parseArgs(['--base-url', 'http://x:1', '--host', '0.0.0.0', '--port', '7777']), {
    baseUrl: 'http://x:1',
    host: '0.0.0.0',
    port: 7777,
  })
})

test('parseArgs: short flags', (t) => {
  t.is(parseArgs(['-h']).help, true)
  t.is(parseArgs(['-v']).version, true)
})

test('parseArgs: rejects unknown args', (t) => {
  t.exception(() => parseArgs(['--nope']), /unknown argument/)
})

test('resolveClientOpts: empty args + no env yields {}', (t) => {
  t.alike(resolveClientOpts({}, {}), {})
})

test('resolveClientOpts: OPENPACT_URL env wins when no --base-url', (t) => {
  t.alike(resolveClientOpts({}, { OPENPACT_URL: 'http://env:9' }), { baseUrl: 'http://env:9' })
})

test('resolveClientOpts: --base-url overrides env', (t) => {
  t.alike(resolveClientOpts({ baseUrl: 'http://flag:1' }, { OPENPACT_URL: 'http://env:9' }), {
    baseUrl: 'http://flag:1',
  })
})

test('resolveClientOpts: forwards host + port', (t) => {
  t.alike(resolveClientOpts({ host: '1.2.3.4', port: 7777 }, {}), {
    host: '1.2.3.4',
    port: 7777,
  })
})

test('resolveClientOpts: NaN port is rejected', (t) => {
  t.exception(() => resolveClientOpts({ port: NaN }, {}), /must be a number/)
})
