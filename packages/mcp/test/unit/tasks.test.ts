import test from 'brittle'
import { TaskNotOpenError } from '@openpact/sdk'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

test('list_tasks: forwards status + limit', async (t) => {
  const pact = fakePact()
  pact.tasks.list.resolveWith([])
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'list_tasks')
  await handler({ status: 'open', limit: 50 })
  t.alike(pact.tasks.list.calls[0].args, [
    { status: 'open', order: undefined, limit: 50, cursor: undefined },
  ])
})

test('get_task: passes id through', async (t) => {
  const pact = fakePact()
  pact.tasks.get.resolveWith({ id: 'a-1', status: 'open' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'get_task')
  await handler({ id: 'a-1' })
  t.alike(pact.tasks.get.calls[0].args, ['a-1'])
})

test('create_task: posts body and prefixes a summary', async (t) => {
  const pact = fakePact()
  pact.tasks.create.resolveWith({ id: 'a-2', timestamp: 'T' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'create_task')
  const r = await handler({ title: 'do it', description: 'now' })
  t.alike(pact.tasks.create.calls[0].args, [{ title: 'do it', description: 'now' }])
  t.ok(r.content[0].text.startsWith('Created task a-2 at T.'))
})

test('create_task: forwards assigned_to when reserving for a specific peer', async (t) => {
  const pact = fakePact()
  pact.tasks.create.resolveWith({ id: 'a-3', timestamp: 'T' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'create_task')
  await handler({ title: 'review PR', assigned_to: 'anon-rat-12345678' })
  t.alike(pact.tasks.create.calls[0].args, [
    { title: 'review PR', assigned_to: 'anon-rat-12345678' },
  ])
})

test('claim_task: lost race surfaces TASK_NOT_OPEN', async (t) => {
  const pact = fakePact()
  pact.tasks.claim.rejectWith(new TaskNotOpenError('lost claim race'))
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'claim_task')
  const r = await handler({ id: 'a-1' })
  t.is(r.isError, true)
  t.is(r.content[0].text, 'TASK_NOT_OPEN: lost claim race')
})

test('complete_task: defaults result to null when omitted', async (t) => {
  const pact = fakePact()
  pact.tasks.complete.resolveWith({ id: 'a-1', status: 'complete' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'complete_task')
  await handler({ id: 'a-1' })
  t.alike(pact.tasks.complete.calls[0].args, ['a-1', { result: null }])
})

test('complete_task: forwards a provided result string', async (t) => {
  const pact = fakePact()
  pact.tasks.complete.resolveWith({ id: 'a-1', status: 'complete' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'complete_task')
  await handler({ id: 'a-1', result: 'PR #42 merged' })
  t.alike(pact.tasks.complete.calls[0].args, ['a-1', { result: 'PR #42 merged' }])
})

test('release_task: passes id through', async (t) => {
  const pact = fakePact()
  pact.tasks.release.resolveWith({ id: 'a-1', status: 'open' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'release_task')
  await handler({ id: 'a-1' })
  t.alike(pact.tasks.release.calls[0].args, ['a-1'])
})
