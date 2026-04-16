import test from 'brittle'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

const KEY = 'a'.repeat(64)

test('grant_member: forwards key + indexer flag', async (t) => {
  const pact = fakePact()
  pact.admin.addMember.resolveWith({ ok: true, key: KEY, indexer: true })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'grant_member')
  const r = await handler({ key: KEY, indexer: true })
  t.alike(pact.admin.addMember.calls[0].args, [KEY, { indexer: true }])
  t.ok(r.content[0].text.includes('Granted indexer role to'))
})

test('grant_member: defaults to member-only when indexer omitted', async (t) => {
  const pact = fakePact()
  pact.admin.addMember.resolveWith({ ok: true, key: KEY, indexer: false })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'grant_member')
  const r = await handler({ key: KEY })
  t.alike(pact.admin.addMember.calls[0].args, [KEY, { indexer: undefined }])
  t.ok(r.content[0].text.includes('Granted member role to'))
})

test('revoke_member: passes key through', async (t) => {
  const pact = fakePact()
  pact.admin.removeMember.resolveWith({ ok: true, key: KEY })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'revoke_member')
  await handler({ key: KEY })
  t.alike(pact.admin.removeMember.calls[0].args, [KEY])
})
