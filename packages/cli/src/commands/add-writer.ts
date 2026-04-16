import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { c, emoji } from '../lib/theme'

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
  const api = new ApiClient({ port: Number(opts.port ?? 7666), pactId })
  try {
    await api.addMember(key, !!opts.indexer)
    const role = opts.indexer ? 'indexer' : 'member'
    console.log(
      `${emoji.bind} ${c.brandBold('A new pact-bearer is bound.')}  ${c.ash(`(${role})`)}`,
    )
    console.log(`  ${c.ash(`key ${key.slice(0, 12)}… on pact ${pactId}`)}`)
    console.log(c.ash('  the binding is broadcast to all peers as an admin entry'))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('openpact daemon is not running')}`)
      process.exit(1)
    }
    throw err
  }
}
