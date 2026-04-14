import pc from 'picocolors'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'

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
    console.log(pc.green(`promoted ${key.slice(0, 12)}… to ${opts.indexer ? 'indexer' : 'writer'}`))
    console.log(pc.dim('  the change is broadcast to peers as an admin entry'))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(pc.red('openpact daemon is not running'))
      process.exit(1)
    }
    throw err
  }
}
