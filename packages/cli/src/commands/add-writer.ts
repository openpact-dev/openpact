import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { c, emoji } from '../lib/theme'
import { short } from '../lib/format'

export interface AddMemberOpts {
  indexer?: boolean
  port?: string | number
  pact?: string
}

export async function addMemberCmd(
  key: string,
  opts: AddMemberOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(`member key must be 64 hex chars (got ${key.length})`)
  }
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const pactId = await resolveCurrentPact(dir, opts.pact)
  const client = new OpenPact({ port: Number(opts.port ?? 7666), pactId, hostDir: dir })
  try {
    await client.admin.addMember(key, { indexer: !!opts.indexer })
    const role = opts.indexer ? 'indexer' : 'member'
    console.log(
      `  ${emoji.bind} ${c.brandBold('A new pact-bearer is bound.')}  ${c.ash(`(${role})`)}`,
    )
    console.log(`  ${c.ash(`Key ${c.bone(short(key, 12) + '…')} on pact ${c.bone(pactId)}`)}`)
    console.log(c.ash('  The binding is broadcast to all peers as an admin entry.'))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
      process.exit(1)
    }
    throw err
  }
}
