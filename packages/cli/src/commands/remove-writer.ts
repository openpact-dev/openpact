import pc from 'picocolors'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'

export interface RemoveWriterOpts {
  port?: string | number
}

export async function removeWriterCmd(key: string, opts: RemoveWriterOpts): Promise<void> {
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(`writer key must be 64 hex chars (got ${key.length})`)
  }
  const api = new ApiClient({ port: Number(opts.port ?? 7331) })
  try {
    await api.removeWriter(key)
    console.log(pc.green(`removed writer ${key.slice(0, 12)}…`))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(pc.red('openpact daemon is not running'))
      process.exit(1)
    }
    throw err
  }
}
