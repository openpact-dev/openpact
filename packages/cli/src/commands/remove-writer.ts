import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { c, emoji } from '../lib/theme'

export interface RemoveMemberOpts {
  port?: string | number
  pact?: string
}

export async function removeMemberCmd(
  key: string,
  opts: RemoveMemberOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(`member key must be 64 hex chars (got ${key.length})`)
  }
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const pactId = await resolveCurrentPact(dir, opts.pact)
  const client = new OpenPact({ port: Number(opts.port ?? 7666), pactId, hostDir: dir })
  try {
    await client.admin.removeMember(key)
    console.log(
      `${emoji.sever} ${c.brandBold('The bond has been severed.')}  ${c.ash(`(${key.slice(0, 12)}… on ${pactId})`)}`,
    )
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('openpact daemon is not running')}`)
      process.exit(1)
    }
    throw err
  }
}
