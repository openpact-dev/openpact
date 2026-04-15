import test from 'brittle'
import { buildServer, TOOL_NAMES } from '../../src/server'
import { fakePact } from '../helpers/fake-pact'

test('buildServer registers exactly the tools listed in TOOL_NAMES', (t) => {
  const server: any = buildServer(fakePact() as any)
  const registered = Object.keys(server._registeredTools).sort()
  t.alike(registered, [...TOOL_NAMES].sort(), 'tool set matches spec exactly')
})

test('every registered tool has a non-trivial description', (t) => {
  const server: any = buildServer(fakePact() as any)
  for (const name of TOOL_NAMES) {
    const entry = server._registeredTools[name]
    t.ok(entry.description?.length >= 20, `${name} has a real description`)
  }
})
