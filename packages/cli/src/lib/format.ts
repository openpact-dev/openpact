import pc from 'picocolors'

export interface StatusPayload {
  pact_id: string | null
  peer_handle: string | null
  role: string | null
  public_key: string | null
  peers: number
  entries: number
  is_writer: boolean
  is_indexer: boolean
  synced: boolean
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

const TYPE_COLOURS: Record<string, (s: string) => string> = {
  knowledge: pc.cyan,
  task: pc.yellow,
  skill: pc.magenta,
  message: pc.green,
}

export function formatStatus(s: StatusPayload): string {
  const lines = [
    `${pc.bold('Pact:')}    ${s.pact_id ? short(s.pact_id) : pc.dim('(not initialised)')}`,
    `${pc.bold('You:')}     ${s.peer_handle ?? pc.dim('(unknown)')}  (role: ${s.role ?? pc.dim('?')})`,
    `${pc.bold('Peers:')}   ${s.peers} online`,
    `${pc.bold('Entries:')} ${s.entries}`,
    `${pc.bold('Writer:')}  ${s.is_writer ? pc.green('yes') : pc.dim('no')}    ${pc.bold('Indexer:')} ${s.is_indexer ? pc.green('yes') : pc.dim('no')}`,
  ]
  return lines.join('\n')
}

export function formatPeers(peers: PeerPayload[]): string {
  if (peers.length === 0) return pc.dim('(no peers connected)')
  const header = `${pad('HANDLE', 24)} ${pad('REMOTE KEY', 16)} STATUS`
  const rows = peers.map(
    (p) =>
      `${pad(p.id, 24)} ${pad(short(p.remote_key), 16)} ${p.online ? pc.green('online') : pc.dim('offline')}`,
  )
  return [pc.bold(header), ...rows].join('\n')
}

export function formatLogLine(entry: LogEntry): string {
  const colour = TYPE_COLOURS[entry.type] ?? ((s: string) => s)
  const summary = summarise(entry)
  return `${pc.dim(entry.timestamp)}  ${colour(`[${entry.type}]`)} ${entry.agent_id}  ${summary}`
}

function summarise(entry: LogEntry): string {
  const p = entry.payload as Record<string, unknown>
  switch (entry.type) {
    case 'knowledge':
      return `topic=${p.topic} — ${truncate(String(p.content ?? ''), 80)}`
    case 'task':
      return `${p.title} [${p.status}${p.claimed_by ? ` by ${p.claimed_by}` : ''}]`
    case 'skill':
      return `${p.name}@${p.version} (${p.format})`
    case 'message':
      return `to ${p.to}: ${truncate(String(p.content ?? ''), 80)}`
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
  return pc.red(`error: ${message}`)
}
