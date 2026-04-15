import test from 'brittle'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

const KEY = 'a'.repeat(64)

test('grant_writer: forwards key + indexer flag', async (t) => {
  const pact = fakePact()
  pact.admin.addWriter.resolveWith({ ok: true, key: KEY, indexer: true })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'grant_writer')
  const r = await handler({ key: KEY, indexer: true })
  t.alike(pact.admin.addWriter.calls[0].args, [KEY, { indexer: true }])
  t.ok(r.content[0].text.includes('Granted indexer role to'))
})

test('grant_writer: defaults to writer-only when indexer omitted', async (t) => {
  const pact = fakePact()
  pact.admin.addWriter.resolveWith({ ok: true, key: KEY, indexer: false })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'grant_writer')
  const r = await handler({ key: KEY })
  t.alike(pact.admin.addWriter.calls[0].args, [KEY, { indexer: undefined }])
  t.ok(r.content[0].text.includes('Granted writer role to'))
})

test('revoke_writer: passes key through', async (t) => {
  const pact = fakePact()
  pact.admin.removeWriter.resolveWith({ ok: true, key: KEY })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'revoke_writer')
  await handler({ key: KEY })
  t.alike(pact.admin.removeWriter.calls[0].args, [KEY])
})
