import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { formatLogLine, type LogEntry } from '../lib/format'
import { c, emoji } from '../lib/theme'

const TYPES = ['knowledge', 'task', 'skill', 'message'] as const
type EntryType = (typeof TYPES)[number]

export interface LogOpts {
  type?: string
  limit?: string | number
  port?: string | number
  pact?: string
}

export async function logCmd(
  opts: LogOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const pactId = await resolveCurrentPact(dir, opts.pact)
  const client = new OpenPact({ port: Number(opts.port ?? 7666), pactId, hostDir: dir })
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
      const page = await fetchPage(client, type, limit)
      for (const entry of page) collected.push({ ...(entry as object), type } as LogEntry)
    }
    // Defensive sort: any entry with a missing/empty timestamp sinks
    // to the front (earliest) so a single bad record can't crash the
    // whole log listing via `undefined.localeCompare`.
    collected.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
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
      console.error(`${emoji.cross} ${c.brand('openpact daemon is not running')}`)
      process.exit(1)
    }
    throw err
  }
}

async function fetchPage(client: OpenPact, type: EntryType, limit: number): Promise<unknown[]> {
  switch (type) {
    case 'knowledge': {
      const page = await client.knowledge.list({ limit })
      return page.entries
    }
    case 'task': {
      // tasks.list returns TaskState (the reduced view). Flatten each
      // state into a LogEntry-shape so formatting stays uniform with
      // the other types. `timestamp` / `updated_at` come from the
      // reducer; `agent_id` is the creator from history[0].
      const page = await client.tasks.list({ limit })
      return page.entries.map((t) => {
        const state = t as {
          id: string
          title: string
          status: string
          claimed_by: string | null
          timestamp: string
          history?: Array<{ agent_id?: string; display_name?: string | null }>
        }
        const first = state.history?.[0]
        return {
          type: 'task',
          timestamp: state.timestamp,
          agent_id: first?.agent_id ?? '',
          display_name: first?.display_name ?? null,
          id: state.id,
          payload: {
            title: state.title,
            status: state.status,
            claimed_by: state.claimed_by,
          },
        }
      })
    }
    case 'skill': {
      const page = await client.skills.list({ limit })
      return page.entries
    }
    case 'message': {
      const page = await client.messages.list({ limit })
      return page.entries
    }
  }
}
