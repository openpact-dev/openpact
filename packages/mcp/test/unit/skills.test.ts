import test from 'brittle'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

test('list_skills: forwards format + limit', async (t) => {
  const pact = fakePact()
  pact.skills.list.resolveWith([])
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'list_skills')
  await handler({ format: 'openclaw', limit: 10 })
  t.alike(pact.skills.list.calls[0].args, [{ format: 'openclaw', limit: 10 }])
})

test('share_skill: forwards full payload', async (t) => {
  const pact = fakePact()
  pact.skills.create.resolveWith({ id: 's-1', timestamp: 'T' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'share_skill')
  const SHA = 'sha256:' + 'a'.repeat(64)
  await handler({
    name: 'scraper',
    version: '1.0.0',
    format: 'openclaw',
    content: 'real content',
    checksum: SHA,
  })
  t.alike(pact.skills.create.calls[0].args, [
    {
      name: 'scraper',
      version: '1.0.0',
      format: 'openclaw',
      content: 'real content',
      checksum: SHA,
    },
  ])
})

test('get_skill_content: passes id through', async (t) => {
  const pact = fakePact()
  pact.skills.getContent.resolveWith({ id: 's-1', content: 'real' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'get_skill_content')
  await handler({ id: 's-1' })
  t.alike(pact.skills.getContent.calls[0].args, ['s-1'])
})
