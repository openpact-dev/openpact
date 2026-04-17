import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import type { KnowledgePayload } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact, NoPactsError } from '../lib/pact-select'
import { c, emoji } from '../lib/theme'

export interface RecordOpts {
  topic?: string
  source?: string
  pact?: string
  port?: string | number
}

export async function recordCmd(
  content: string,
  opts: RecordOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const trimmed = typeof content === 'string' ? content.trim() : ''
  if (!trimmed) throw new Error('knowledge content must not be empty')
  const topic = opts.topic?.trim()
  if (!topic) throw new Error('--topic is required (e.g. routing, auth, db-schema)')

  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  let pactId: string
  try {
    pactId = await resolveCurrentPact(hostDir, opts.pact)
  } catch (err) {
    if (err instanceof NoPactsError) {
      console.error(`${emoji.cross} ${c.brand(err.message)}`)
      process.exit(1)
    }
    throw err
  }
  const client = new OpenPact({ port: Number(opts.port ?? 7666), pactId, hostDir })

  try {
    const payload: KnowledgePayload = { topic, content: trimmed }
    if (opts.source) payload.source = opts.source
    const res = await client.knowledge.create(payload)
    console.log(`  ${emoji.brand} ${c.brandBold('Recorded')} ${c.bone(topic)} ${c.ash(res.id)}`)
    console.log(`  ${c.ash(res.timestamp)}`)
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
      process.exit(1)
    }
    throw err
  }
}
