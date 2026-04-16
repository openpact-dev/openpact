import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Daemon } from '../../../src/daemon'
import { createApi } from '../../../src/api'
import { loadPactConfig } from '../../../src/config'

async function mkDir(t: any, prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

test('POST /v1/pacts/join persists pact_name to local config', async (t) => {
  // Creator on one host, just to get a valid pact key to join against.
  const aDir = await mkDir(t, 'openpact-a-')
  const a = await Daemon.create({ dataDir: aDir, pactName: 'Coven' })
  t.teardown(() => a.stop())
  const pactKey = a.pactKey!

  // Fresh host does the join via the HTTP surface, threading pact_name
  // through so the joiner's local config.json records it.
  const bDir = await mkDir(t, 'openpact-b-')
  const b = new Daemon({ dataDir: bDir })
  const bApi = createApi(b)
  t.teardown(() => bApi.close())

  const res = await bApi.inject({
    method: 'POST',
    url: '/v1/pacts/join',
    payload: {
      key: pactKey,
      alias: 'coven',
      display_name: 'Bob',
      pact_name: 'Coven',
      pact_purpose: 'Testing invite-seeded names',
      confirm: true,
    },
  })
  t.is(res.statusCode, 200, res.body)
  const body = JSON.parse(res.body)
  t.is(body.pact_name, 'Coven')
  t.is(body.pact_purpose, 'Testing invite-seeded names')

  // The joined pact's on-disk config should also carry the seeded name.
  const cfg = await loadPactConfig(path.join(bDir, 'pacts', 'coven'))
  t.is(cfg.pactName, 'Coven', 'pact_name was persisted to config.json')
  t.is(cfg.pactPurpose, 'Testing invite-seeded names')
})

test('POST /v1/pacts/join without pact_name leaves config.pactName null', async (t) => {
  const aDir = await mkDir(t, 'openpact-a-')
  const a = await Daemon.create({ dataDir: aDir })
  t.teardown(() => a.stop())
  const pactKey = a.pactKey!

  const bDir = await mkDir(t, 'openpact-b-')
  const b = new Daemon({ dataDir: bDir })
  const bApi = createApi(b)
  t.teardown(() => bApi.close())

  const res = await bApi.inject({
    method: 'POST',
    url: '/v1/pacts/join',
    payload: { key: pactKey, alias: 'unnamed', confirm: true },
  })
  t.is(res.statusCode, 200)
  const cfg = await loadPactConfig(path.join(bDir, 'pacts', 'unnamed'))
  t.is(cfg.pactName, null)
})
