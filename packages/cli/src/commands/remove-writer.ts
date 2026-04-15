import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { c, emoji } from '../lib/theme'

export interface RemoveWriterOpts {
  port?: string | number
  pact?: string
}

export async function removeWriterCmd(
  key: string,
  opts: RemoveWriterOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(`writer key must be 64 hex chars (got ${key.length})`)
  }
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const pactId = await resolveCurrentPact(dir, opts.pact)
  const api = new ApiClient({ port: Number(opts.port ?? 7666), pactId })
  try {
    await api.removeWriter(key)
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
