import test from 'brittle'
import { listByType, BadCursorError } from '../../../src/api/views'
import { tmpDaemon } from '../../helpers/tmp-daemon'

async function seedKnowledge(daemon: any, count: number): Promise<void> {
  const pact = daemon.current!
  for (let i = 0; i < count; i++) {
    await pact.append({
      type: 'knowledge',
      timestamp: new Date(Date.UTC(2026, 3, 15, 12, 0, i)).toISOString(),
      agent_id: pact.peerHandle,
      display_name: pact.displayName,
      payload: { topic: i % 2 === 0 ? 'evens' : 'odds', content: `entry ${i}` },
    })
  }
  await pact.update()
}

test('listByType: default order is desc (newest first)', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  await seedKnowledge(daemon, 5)

  const page = await listByType(daemon.current!.view, 'knowledge', { limit: 100 })
  t.is(page.entries.length, 5)
  const contents = page.entries.map((e: any) => e.payload.content)
  t.alike(contents, ['entry 4', 'entry 3', 'entry 2', 'entry 1', 'entry 0'])
  t.is(page.has_more, false, 'no more rows past the last one')
  t.ok(page.cursor, 'cursor points to the last kept key')
})

test('listByType: asc order returns oldest first', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  await seedKnowledge(daemon, 4)

  const page = await listByType(daemon.current!.view, 'knowledge', {
    order: 'asc',
    limit: 100,
  })
  const contents = page.entries.map((e: any) => e.payload.content)
  t.alike(contents, ['entry 0', 'entry 1', 'entry 2', 'entry 3'])
  t.is(page.has_more, false)
})

test('listByType: cursor round-trip walks every page', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  await seedKnowledge(daemon, 7)

  const seen: string[] = []
  let cursor: string | null = null
  let has_more = true
  let pages = 0
  while (has_more) {
    const page: any = await listByType(daemon.current!.view, 'knowledge', {
      order: 'desc',
      limit: 3,
      cursor,
    })
    for (const e of page.entries) seen.push(e.payload.content)
    cursor = page.cursor
    has_more = page.has_more
    pages++
    if (pages > 10) t.fail('cursor loop did not terminate')
  }
  t.is(seen.length, 7)
  t.alike(seen, ['entry 6', 'entry 5', 'entry 4', 'entry 3', 'entry 2', 'entry 1', 'entry 0'])
})

test('listByType: has_more is true when more rows remain', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  await seedKnowledge(daemon, 5)

  const page = await listByType(daemon.current!.view, 'knowledge', {
    order: 'desc',
    limit: 2,
  })
  t.is(page.entries.length, 2)
  t.is(page.has_more, true)
})

test('listByType: filter interacts correctly with limit', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  await seedKnowledge(daemon, 6) // evens: 0,2,4; odds: 1,3,5

  const page = await listByType(daemon.current!.view, 'knowledge', {
    order: 'desc',
    limit: 10,
    filter: (v: any) => v.payload.topic === 'evens',
  })
  t.is(page.entries.length, 3)
  const contents = page.entries.map((e: any) => e.payload.content)
  t.alike(contents, ['entry 4', 'entry 2', 'entry 0'])
})

test('listByType: BadCursorError when cursor is malformed', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  await seedKnowledge(daemon, 2)

  await t.exception(
    () => listByType(daemon.current!.view, 'knowledge', { cursor: 'task/something' }),
    BadCursorError,
  )
})

test('listByType: empty view returns empty page', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })

  const page = await listByType(daemon.current!.view, 'knowledge', {})
  t.is(page.entries.length, 0)
  t.is(page.cursor, null)
  t.is(page.has_more, false)
})

test('listByType: clamps limit above hard max', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  await seedKnowledge(daemon, 3)

  // Ridiculous limit still works — clamped to 1000 internally, which
  // comfortably swallows the tiny seed.
  const page = await listByType(daemon.current!.view, 'knowledge', { limit: 1_000_000 })
  t.is(page.entries.length, 3)
})
