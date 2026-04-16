/**
 * The `requires_approval` flag must replicate intact: a skill written
 * on daemon A with the flag set surfaces on daemon B with the flag
 * preserved.
 */
import test from 'brittle'
import { pair } from '../../helpers/pair'
import { listByType } from '../../../src/api/views'
import type { Daemon } from '../../../src/daemon'
import { skillChecksum } from '../../../src/skills'

function sha(content: string): string {
  return skillChecksum(content)
}

test('requires_approval flag replicates from A to B', async (t) => {
  const { a, b } = await pair(t)
  await admitMember(a.daemon, b.daemon)

  const content = 'manual-review-please'
  await a.daemon.append({
    type: 'skill',
    timestamp: new Date().toISOString(),
    agent_id: a.daemon.peerHandle!,
    payload: {
      name: 'flagged-skill',
      version: '1.0.0',
      format: 'generic',
      content,
      checksum: sha(content),
      requires_approval: true,
    },
  })

  const page = await waitForSkills(b.daemon, 1, { timeout: 15000 })
  t.is(page.entries.length, 1, 'B sees the skill')
  const entry = page.entries[0] as {
    payload: { requires_approval: boolean; checksum: string }
  }
  t.is(entry.payload.requires_approval, true, 'flag preserved across replication')
  t.is(entry.payload.checksum, sha(content), 'checksum preserved')
})

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15000 })
}

async function waitForSkills(
  daemon: Daemon,
  count: number,
  { timeout = 10000 }: { timeout?: number } = {},
) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await daemon.update()
    const page = await listByType(daemon.view, 'skill', { limit: 10 })
    if (page.entries.length >= count) return page
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForSkills(${count}) timeout`)
}
