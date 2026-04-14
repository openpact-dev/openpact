import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { formatLogLine, type LogEntry } from '../lib/format'
import { c } from '../lib/theme'

const TYPES = ['knowledge', 'task', 'skill', 'message'] as const
type EntryType = (typeof TYPES)[number]

export interface LogOpts {
  type?: string
  limit?: string | number
  port?: string | number
}

export async function logCmd(opts: LogOpts): Promise<void> {
  const api = new ApiClient({ port: Number(opts.port ?? 7331) })
  const limit = Number(opts.limit ?? 20)

  let types: readonly EntryType[]
  if (opts.type) {
    if (!(TYPES as readonly string[]).includes(opts.type)) {
      throw new Error(`unknown type: ${opts.type}. Allowed: ${TYPES.join(', ')}`)
    }
    types = [opts.type as EntryType]
  } else {
    types = TYPES
  }

  try {
    const collected: LogEntry[] = []
    for (const type of types) {
      const list = await api.list(type, { limit })
      for (const entry of list) collected.push({ ...entry, type })
    }
    collected.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const tail = collected.slice(-limit)
    if (tail.length === 0) {
      console.log(c.ash('(the pact is silent)'))
      return
    }
    for (const entry of tail) {
      console.log(formatLogLine(entry))
    }
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(c.brand('✗ openpact daemon is not running'))
      process.exit(1)
    }
    throw err
  }
}
