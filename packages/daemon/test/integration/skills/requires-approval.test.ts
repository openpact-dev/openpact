/**
 * The `requires_approval` flag must replicate intact: a skill written
 * on daemon A with the flag set surfaces on daemon B with the flag
 * preserved.
 */
import test from 'brittle'
import { createHash } from 'crypto'
import { pair } from '../../helpers/pair'
import { listByType } from '../../../src/api/views'

function sha(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}

test('requires_approval flag replicates from A to B', async (t) => {
  const { a, b } = await pair(t)

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

  await b.daemon.waitForViewVersion(2, { timeout: 15000 })
  const page = await listByType(b.daemon.view, 'skill', { limit: 10 })
  t.is(page.entries.length, 1, 'B sees the skill')
  t.is(page.entries[0].payload.requires_approval, true, 'flag preserved across replication')
  t.is(page.entries[0].payload.checksum, sha(content), 'checksum preserved')
})
