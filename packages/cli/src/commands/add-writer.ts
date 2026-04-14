import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { c, emoji } from '../lib/theme'

export interface AddWriterOpts {
  indexer?: boolean
  port?: string | number
}

export async function addWriterCmd(key: string, opts: AddWriterOpts): Promise<void> {
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(`writer key must be 64 hex chars (got ${key.length})`)
  }
  const api = new ApiClient({ port: Number(opts.port ?? 7331) })
  try {
    await api.addWriter(key, !!opts.indexer)
    const role = opts.indexer ? 'indexer' : 'writer'
    console.log(
      `${emoji.bind} ${c.brandBold('A new pact-bearer is bound.')}  ${c.ash(`(${role})`)}`,
    )
    console.log(`  ${c.ash(`key ${key.slice(0, 12)}…`)}`)
    console.log(c.ash('  the binding is broadcast to all peers as an admin entry'))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('openpact daemon is not running')}`)
      process.exit(1)
    }
    throw err
  }
}
