import pc from 'picocolors'
import { c, emoji, mark } from './theme'

export interface StatusPayload {
  pact_id: string | null
  pact_name?: string | null
  pact_purpose?: string | null
  peer_handle: string | null
  display_name?: string | null
  role: string | null
  public_key: string | null
  peers: number
  entries: number
  is_member: boolean
  is_indexer: boolean
  synced: boolean
}

export interface HostStatusPayload {
  current: string | null
  peers: number
  pact_count: number
}

export interface StatusContext {
  alias: string
  totalPacts: number
  currentAlias: string | null
  apiPort: number
  dashboardPort: number
  dataDir: string
  pid?: number | null
}

export interface PeerPayload {
  id: string
  remote_key: string
  online: boolean
}

export interface LogEntry {
  type: string
  timestamp: string
  agent_id: string
  payload: Record<string, unknown>
  id?: string
}

// Each entry type gets a distinct colour. No per-line glyphs — the colour
// alone is enough to scan; adding a symbol on every line was noisy.
const TYPE_COLOUR: Record<string, (s: string) => string> = {
  knowledge: c.brand,
  task: c.ember,
  skill: pc.magenta,
  message: pc.cyan,
}

export function formatStatus(s: StatusPayload, ctx?: StatusContext): string {
  const unknown = c.ash('—')
  const synced = s.synced ? c.brand('synced') : c.ember('not synced')

  const pactName = s.pact_name ?? null
  const pactPurpose = s.pact_purpose ?? null
  const displayName = s.display_name ?? null

  // Pad to the widest label so every column aligns.
  const LABEL_WIDTH = 10
  const row = (label: string, value: string): string =>
    `  ${c.brandBold(label)}${' '.repeat(Math.max(1, LABEL_WIDTH - label.length))}${value}`

  const aliasLine = ctx
    ? `${ctx.alias}${ctx.alias === ctx.currentAlias ? c.ash('  (current)') : ''}  ${c.ash(`${ctx.totalPacts} pact${ctx.totalPacts === 1 ? '' : 's'} on this host`)}`
    : null

  const lines: string[] = [`  ${mark()}`, '']

  if (pactName) lines.push(row('Pact', c.bone(pactName)))
  if (pactPurpose) lines.push(row('Purpose', c.ash(pactPurpose)))
  if (aliasLine) lines.push(row('Alias', aliasLine))
  lines.push(row('ID', s.pact_id ? c.ash(short(s.pact_id, 16)) : unknown))
  lines.push('')

  const handle = s.peer_handle ?? unknown
  const agent = displayName ? `${c.bone(displayName)}  ${c.ash(`(${handle})`)}` : handle
  lines.push(row('Agent', `${agent}  ${c.ash(`· ${s.role ?? '?'}`)}`))
  lines.push('')

  lines.push(row('Peers', String(s.peers)))
  lines.push(row('Entries', `${s.entries}  ${c.ash(`· ${synced}`)}`))

  if (ctx) {
    lines.push('')
    lines.push(row('REST', c.ash(`http://127.0.0.1:${ctx.apiPort}/v1/pacts/${ctx.alias}/*`)))
    lines.push(row('Dashboard', c.ash(`http://127.0.0.1:${ctx.dashboardPort}`)))
    lines.push(row('PID', ctx.pid ? c.ash(String(ctx.pid)) : unknown))
    lines.push(row('Data dir', c.ash(ctx.dataDir)))
  }

  return lines.join('\n')
}

export function formatHostStatus(s: HostStatusPayload, ctx: Omit<StatusContext, 'alias'>): string {
  const unknown = c.ash('—')
  const LABEL_WIDTH = 10
  const row = (label: string, value: string): string =>
    `  ${c.brandBold(label)}${' '.repeat(Math.max(1, LABEL_WIDTH - label.length))}${value}`

  const pactSummary =
    s.pact_count === 0
      ? `${s.pact_count}  ${c.ash('· no pacts yet')}`
      : `${s.pact_count}  ${c.ash(`· current ${s.current ?? 'none'}`)}`

  return [
    `  ${mark()}`,
    '',
    row('Host', c.bone('Daemon is running')),
    row('Pacts', pactSummary),
    row('Peers', String(s.peers)),
    '',
    row('Daemon', c.ash(`http://127.0.0.1:${ctx.apiPort}/v1/*`)),
    row('Dashboard', c.ash(`http://127.0.0.1:${ctx.dashboardPort}`)),
    row('PID', ctx.pid ? c.ash(String(ctx.pid)) : unknown),
    row('Data dir', c.ash(ctx.dataDir)),
  ].join('\n')
}

export function formatPeers(peers: PeerPayload[]): string {
  if (peers.length === 0) return c.ash('(no peers bound to this pact)')
  const header = `${pad('HANDLE', 24)} ${pad('REMOTE KEY', 16)} STATUS`
  const rows = peers.map(
    (p) =>
      `${pad(p.id, 24)} ${pad(short(p.remote_key), 16)} ${p.online ? c.brand('●') + ' online' : c.ash('○ offline')}`,
  )
  return [c.brandBold(header), ...rows].join('\n')
}

export function formatLogLine(entry: LogEntry): string {
  const colour = TYPE_COLOUR[entry.type] ?? c.ash
  const summary = summarise(entry)
  return `${c.ash(entry.timestamp)}  ${colour(pad(entry.type, 10))} ${entry.agent_id}  ${summary}`
}

function summarise(entry: LogEntry): string {
  const p = entry.payload as Record<string, unknown>
  switch (entry.type) {
    case 'knowledge':
      return `${c.ash('topic=')}${p.topic}  ${truncate(String(p.content ?? ''), 80)}`
    case 'task':
      return `${p.title} ${c.ash(`[${p.status}${p.claimed_by ? ` by ${p.claimed_by}` : ''}]`)}`
    case 'skill':
      return `${p.name}${c.ash('@')}${p.version} ${c.ash(`(${p.format})`)}`
    case 'message':
      return truncate(String(p.content ?? ''), 80)
    default:
      return JSON.stringify(p)
  }
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

function short(s: string, n = 12): string {
  return s.length <= n ? s : s.slice(0, n)
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

export function formatError(message: string): string {
  return `${emoji.cross} ${c.brand(message)}`
}
