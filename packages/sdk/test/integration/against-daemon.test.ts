import test from 'brittle'
import {
  OpenPact,
  TaskNotOpenError,
  NotFoundError,
  BadRequestError,
  computeSkillChecksum,
} from '../../src'
import { Daemon, createApi, bind } from '@openpact/daemon'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

let nextPort = 18800

async function tmpDaemonWithApi(
  t: any,
): Promise<{ pact: OpenPact; daemonHandle: { stop: () => Promise<void> } }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-sdk-'))
  const daemon = await Daemon.create({ dataDir: dir })
  // await daemon.start() — skipped: no swarm needed for HTTP-only tests
  const app = createApi(daemon)
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })

  const pact = new OpenPact({ port, pactId: 'default' })

  const stop = async () => {
    await app.close()
    await daemon.stop()
    await fs.rm(dir, { recursive: true, force: true })
  }
  t.teardown(stop)
  return { pact, daemonHandle: { stop } }
}

test('SDK end-to-end: ping + status + peers against real daemon', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  t.alike(await pact.ping(), { ok: true })
  const status = await pact.status()
  t.is(status.role, 'creator')
  t.is(status.is_member, true)
  t.alike(await pact.peers(), [])
})

test('SDK end-to-end: knowledge create + list', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  const { id } = await pact.knowledge.create({
    topic: 'sales',
    content: 'Tuesdays convert better',
    confidence: 0.8,
  })
  t.ok(/^[0-9a-f]{8}-\d+$/.test(id))

  // Wait for the apply to land in the view.
  const deadline = Date.now() + 2000
  let entries: any[] = []
  while (Date.now() < deadline) {
    const page = await pact.knowledge.list({ topic: 'sales' })
    entries = page.entries
    if (entries.length >= 1) break
    await new Promise((r) => setTimeout(r, 50))
  }
  t.is(entries.length, 1)
  t.is(entries[0].payload.content, 'Tuesdays convert better')
})

test('SDK end-to-end: tasks lifecycle (create → claim → complete)', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  const { id } = await pact.tasks.create({ title: 'Build it' })

  // Wait for view to settle then claim.
  await waitFor(async () => (await pact.tasks.get(id)).status === 'open')
  const claimed = await pact.tasks.claim(id)
  t.is(claimed.task.status, 'claimed')

  const completed = await pact.tasks.complete(id, { result: 'shipped' })
  t.is(completed.task.status, 'complete')
  t.is(completed.task.result, 'shipped')
})

test('SDK end-to-end: claiming a non-open task throws TaskNotOpenError', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  const { id } = await pact.tasks.create({ title: 'Once' })
  await waitFor(async () => (await pact.tasks.get(id)).status === 'open')
  await pact.tasks.claim(id)
  await t.exception(() => pact.tasks.claim(id), TaskNotOpenError)
})

test('SDK end-to-end: tasks.get on unknown id throws NotFoundError', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  await t.exception(() => pact.tasks.get('zzzz-99'), NotFoundError)
})

test('SDK end-to-end: skills create + getContent', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  const content = 'real content'
  const checksum = await computeSkillChecksum(content)
  const { id } = await pact.skills.create({
    name: 'scraper',
    version: '1.0.0',
    format: 'openclaw',
    content,
    checksum,
  })
  await waitFor(async () => (await pact.skills.list()).entries.length >= 1)
  const got = await pact.skills.getContent(id)
  t.is(got.content, content)
  t.is(got.checksum, checksum)
})

test('SDK end-to-end: messages send + list with since cursor', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  await pact.messages.send({ to: '*', content: 'first' })
  await new Promise((r) => setTimeout(r, 5))
  const cutoff = new Date().toISOString()
  await new Promise((r) => setTimeout(r, 5))
  await pact.messages.send({ to: '*', content: 'second' })
  await waitFor(async () => (await pact.messages.list()).entries.length >= 2)
  const recent = await pact.messages.list({ since: cutoff })
  t.is(recent.entries.length, 1)
  t.is(recent.entries[0].payload.content, 'second')
})

test('SDK end-to-end: knowledge paginates via cursor', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  for (let i = 0; i < 5; i++) {
    await pact.knowledge.create({ topic: 't', content: `c${i}` })
  }
  await waitFor(async () => (await pact.knowledge.list({ limit: 100 })).entries.length >= 5)

  const seen: string[] = []
  for await (const entry of pact.knowledge.iterate({ limit: 2 })) {
    seen.push((entry.payload as any).content)
  }
  // Default desc order: newest first.
  t.alike(seen, ['c4', 'c3', 'c2', 'c1', 'c0'])
})

test('SDK end-to-end: knowledge.create rejects bad payload with BadRequestError', async (t) => {
  const { pact } = await tmpDaemonWithApi(t)
  // Empty topic violates the schema.
  await t.exception(() => pact.knowledge.create({ topic: '', content: 'x' }), BadRequestError)
})

async function waitFor(predicate: () => Promise<boolean>, timeout = 3000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('waitFor timeout')
}
