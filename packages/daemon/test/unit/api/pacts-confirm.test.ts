import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Daemon } from '../../../src/daemon'
import { createApi } from '../../../src/api'

/**
 * Phase 2c: destructive and side-effectful pact-registry routes demand a
 * *typed* confirmation (echo the alias) rather than a boolean. These tests
 * pin the new contract so a silent regression back to `confirm: true`
 * breaks CI.
 */

async function mkDir(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-pacts-confirm-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

async function newDaemonWithApi(t: any) {
  const dir = await mkDir(t)
  const d = await Daemon.create({ dataDir: dir, pactName: 'First' })
  t.teardown(() => d.stop())
  const api = createApi(d)
  t.teardown(() => api.close())
  return { daemon: d, api, dir }
}

test('DELETE /v1/pacts/:alias: boolean confirm is rejected', async (t) => {
  const { api } = await newDaemonWithApi(t)
  const res = await api.inject({
    method: 'DELETE',
    url: '/v1/pacts/default',
    payload: { confirm: true },
  })
  // ajv rejects the wrong type before the handler sees it.
  t.is(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.ok(/confirm/i.test(body?.message ?? ''), `expected schema rejection, got: ${res.body}`)
})

test('DELETE /v1/pacts/:alias: missing confirm is rejected', async (t) => {
  const { api } = await newDaemonWithApi(t)
  const res = await api.inject({ method: 'DELETE', url: '/v1/pacts/default', payload: {} })
  t.is(res.statusCode, 400)
})

test('DELETE /v1/pacts/:alias: confirm="wrong-alias" is rejected', async (t) => {
  const { api } = await newDaemonWithApi(t)
  const res = await api.inject({
    method: 'DELETE',
    url: '/v1/pacts/default',
    payload: { confirm: 'typo' },
  })
  t.is(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.is(body.error, 'NOT_CONFIRMED')
})

test('DELETE /v1/pacts/:alias: confirm matching alias succeeds', async (t) => {
  const { daemon, api } = await newDaemonWithApi(t)
  const res = await api.inject({
    method: 'DELETE',
    url: '/v1/pacts/default',
    payload: { confirm: 'default' },
  })
  t.is(res.statusCode, 200, res.body)
  const body = JSON.parse(res.body)
  t.is(body.removed.alias, 'default')
  // Registry should be empty after a successful remove.
  const pacts = await daemon.listPacts()
  t.is(pacts.length, 0)
})

test('DELETE /v1/pacts/:alias: confirm matching full pact_id also succeeds', async (t) => {
  const { daemon, api } = await newDaemonWithApi(t)
  const pacts = await daemon.listPacts()
  const pactId = pacts[0]!.pactId
  const res = await api.inject({
    method: 'DELETE',
    url: `/v1/pacts/${pactId}`,
    payload: { confirm: pactId },
  })
  t.is(res.statusCode, 200, res.body)
  const body = JSON.parse(res.body)
  t.is(body.removed.pact_id, pactId)
})

test('POST /v1/pacts/switch: missing confirm is rejected', async (t) => {
  const { api } = await newDaemonWithApi(t)
  const res = await api.inject({
    method: 'POST',
    url: '/v1/pacts/switch',
    payload: { alias: 'default' },
  })
  t.is(res.statusCode, 400)
})

test('POST /v1/pacts/switch: confirm must echo alias', async (t) => {
  const { api } = await newDaemonWithApi(t)
  const wrong = await api.inject({
    method: 'POST',
    url: '/v1/pacts/switch',
    payload: { alias: 'default', confirm: 'other' },
  })
  t.is(wrong.statusCode, 400)
  t.is(JSON.parse(wrong.body).error, 'NOT_CONFIRMED')

  const right = await api.inject({
    method: 'POST',
    url: '/v1/pacts/switch',
    payload: { alias: 'default', confirm: 'default' },
  })
  t.is(right.statusCode, 200, right.body)
  t.is(JSON.parse(right.body).current, 'default')
})
