import test from 'brittle'
import { createApi, bind } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('bind: refuses 0.0.0.0', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await t.exception(() => bind(app, { host: '0.0.0.0', port: 0 }), /must bind to localhost/)
})

test('bind: refuses public addresses', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await t.exception(() => bind(app, { host: '192.168.1.1', port: 0 }), /must bind to localhost/)
})

test('bind: accepts 127.0.0.1 with ephemeral port', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const url = await bind(app, { host: '127.0.0.1', port: 0 })
  t.ok(url.includes('127.0.0.1'))
})

test('bind: accepts localhost', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const url = await bind(app, { host: 'localhost', port: 0 })
  t.ok(typeof url === 'string' && url.startsWith('http'))
})
