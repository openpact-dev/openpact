import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('GET /v1/pacts/:pactId/agents returns empty array when not started', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
  t.is(res.statusCode, 200)
  t.alike(JSON.parse(res.body), [])
})
