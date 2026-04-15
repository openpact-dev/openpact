import test from 'brittle'
import { parseBootstrap, resolveBootstrap } from '../../src/lib/bootstrap'

test('parseBootstrap: empty / null / undefined → null', (t) => {
  t.is(parseBootstrap(undefined), null)
  t.is(parseBootstrap(null), null)
  t.is(parseBootstrap(''), null)
  t.is(parseBootstrap('   '), null)
  t.is(parseBootstrap(','), null)
})

test('parseBootstrap: single host:port', (t) => {
  t.alike(parseBootstrap('127.0.0.1:7666'), [{ host: '127.0.0.1', port: 7666 }])
})

test('parseBootstrap: multiple comma-separated entries', (t) => {
  t.alike(parseBootstrap('a:1,b:2,c:3'), [
    { host: 'a', port: 1 },
    { host: 'b', port: 2 },
    { host: 'c', port: 3 },
  ])
})

test('parseBootstrap: trims whitespace around entries', (t) => {
  t.alike(parseBootstrap('  a:1 , b:2  '), [
    { host: 'a', port: 1 },
    { host: 'b', port: 2 },
  ])
})

test('parseBootstrap: IPv6-style host (last colon wins)', (t) => {
  t.alike(parseBootstrap('::1:7666'), [{ host: '::1', port: 7666 }])
})

test('parseBootstrap: rejects entry without colon', (t) => {
  t.exception(() => parseBootstrap('hostonly'), /must be host:port/)
})

test('parseBootstrap: rejects empty host', (t) => {
  t.exception(() => parseBootstrap(':7666'), /invalid bootstrap entry/)
})

test('parseBootstrap: rejects non-numeric port', (t) => {
  t.exception(() => parseBootstrap('host:abc'), /invalid bootstrap entry/)
})

test('parseBootstrap: rejects port out of range', (t) => {
  t.exception(() => parseBootstrap('host:0'), /invalid bootstrap entry/)
  t.exception(() => parseBootstrap('host:70000'), /invalid bootstrap entry/)
})

test('resolveBootstrap: flag wins over env', (t) => {
  const orig = process.env.OPENPACT_BOOTSTRAP
  process.env.OPENPACT_BOOTSTRAP = 'env:1'
  try {
    t.alike(resolveBootstrap('flag:2'), [{ host: 'flag', port: 2 }])
  } finally {
    if (orig === undefined) delete process.env.OPENPACT_BOOTSTRAP
    else process.env.OPENPACT_BOOTSTRAP = orig
  }
})

test('resolveBootstrap: falls back to env when no flag', (t) => {
  const orig = process.env.OPENPACT_BOOTSTRAP
  process.env.OPENPACT_BOOTSTRAP = 'envhost:9999'
  try {
    t.alike(resolveBootstrap(undefined), [{ host: 'envhost', port: 9999 }])
  } finally {
    if (orig === undefined) delete process.env.OPENPACT_BOOTSTRAP
    else process.env.OPENPACT_BOOTSTRAP = orig
  }
})

test('resolveBootstrap: returns null when neither set', (t) => {
  const orig = process.env.OPENPACT_BOOTSTRAP
  delete process.env.OPENPACT_BOOTSTRAP
  try {
    t.is(resolveBootstrap(undefined), null)
  } finally {
    if (orig !== undefined) process.env.OPENPACT_BOOTSTRAP = orig
  }
})
