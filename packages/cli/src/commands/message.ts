import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import type { MessagePayload } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact, NoPactsError } from '../lib/pact-select'
import { c, emoji } from '../lib/theme'

export interface MessageOpts {
  pact?: string
  port?: string | number
  priority?: string
}

const PRIORITIES = ['low', 'normal', 'high'] as const

export async function messageCmd(
  content: string,
  opts: MessageOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const trimmed = typeof content === 'string' ? content.trim() : ''
  if (!trimmed) throw new Error('message content must not be empty')

  let priority: MessagePayload['priority']
  if (opts.priority !== undefined) {
    if (!(PRIORITIES as readonly string[]).includes(opts.priority)) {
      throw new Error(`unknown priority: ${opts.priority}. Allowed: ${PRIORITIES.join(', ')}`)
    }
    priority = opts.priority as MessagePayload['priority']
  }

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
    const payload: MessagePayload = { content: trimmed }
    if (priority) payload.priority = priority
    const res = await client.messages.send(payload)
    console.log(`  ${emoji.brand} ${c.brandBold('Broadcast')} ${c.ash(res.id)}`)
    console.log(`  ${c.ash(res.timestamp)}`)
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
      process.exit(1)
    }
    throw err
  }
}
