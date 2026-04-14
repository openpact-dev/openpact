import pc from 'picocolors'
import { c, glyph, mark } from './theme'

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

// Each entry type gets a coloured glyph. Knowledge is the brand red; the
// rest use complementary colours so the log scans visually.
const TYPE_MARKS: Record<string, { glyph: string; colour: (s: string) => string }> = {
  knowledge: { glyph: glyph.point, colour: c.brand },
  task: { glyph: '◆', colour: c.ember },
  skill: { glyph: '✶', colour: pc.magenta },
  message: { glyph: '○', colour: pc.cyan },
}

export function formatStatus(s: StatusPayload): string {
  const yes = c.brand('●')
  const no = c.ash('○')
  const unknown = c.ash('—')
  const synced = s.synced ? c.brand('synced') : c.ember('not synced')

  const lines = [
    `  ${mark()}`,
    '',
    `  ${c.brandBold('Pact')}     ${s.pact_id ? c.bone(short(s.pact_id, 16)) : unknown}`,
    `  ${c.brandBold('You')}      ${s.peer_handle ?? unknown}  ${c.ash(`(${s.role ?? '?'})`)}`,
    `  ${c.brandBold('Peers')}    ${s.peers}`,
    `  ${c.brandBold('Entries')}  ${s.entries}  ${c.ash(synced)}`,
    `  ${c.brandBold('Writer')}   ${s.is_writer ? yes : no}    ${c.brandBold('Indexer')} ${s.is_indexer ? yes : no}`,
  ]
  return lines.join('\n')
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
  const m = TYPE_MARKS[entry.type] ?? { glyph: glyph.bullet, colour: c.ash }
  const summary = summarise(entry)
  return `${c.ash(entry.timestamp)}  ${m.colour(m.glyph)} ${m.colour(pad(entry.type, 9))} ${entry.agent_id}  ${summary}`
}

function summarise(entry: LogEntry): string {
  const p = entry.payload as Record<string, unknown>
  switch (entry.type) {
    case 'knowledge':
      return `${c.ash('topic=')}${p.topic} ${c.ash('—')} ${truncate(String(p.content ?? ''), 80)}`
    case 'task':
      return `${p.title} ${c.ash(`[${p.status}${p.claimed_by ? ` by ${p.claimed_by}` : ''}]`)}`
    case 'skill':
      return `${p.name}${c.ash('@')}${p.version} ${c.ash(`(${p.format})`)}`
    case 'message':
      return `${c.ash('to')} ${p.to}: ${truncate(String(p.content ?? ''), 80)}`
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
  return c.brand(`✗ ${message}`)
}
