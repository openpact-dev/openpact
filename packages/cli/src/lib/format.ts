import pc from 'picocolors'
import { c, emoji, mark } from './theme'

// ─── Public types ───────────────────────────────────────────────────────────

export interface StatusPayload {
  pact_id: string | null
  pact_name?: string | null
  pact_purpose?: string | null
  peer_handle: string | null
  display_name?: string | null
  role: string | null
  public_key: string | null
  agents: number
  entries: number
  is_member: boolean
  is_indexer: boolean
  synced: boolean
}

export interface HostStatusPayload {
  current: string | null
  agents: number
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

export interface AgentPayload {
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

// ─── Layout primitives ──────────────────────────────────────────────────────
// Every card and table renders inside a 2-column outer indent so output sits
// in a consistent gutter no matter which command emitted it.

const INDENT = '  '
const RULE_CHAR = '─'
const DEFAULT_RULE_WIDTH = 64

/** Strip ANSI escape sequences so width math is correct. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

/** Visible length of a string with colours stripped. */
export function visibleLength(s: string): number {
  return stripAnsi(s).length
}

/** Right-pad to a visible width (left-aligned text, padding on the right). */
export function padRight(s: string, n: number): string {
  const v = visibleLength(s)
  return v >= n ? s : s + ' '.repeat(n - v)
}

/** Left-pad to a visible width (right-aligned text, padding on the left). */
export function padLeft(s: string, n: number): string {
  const v = visibleLength(s)
  return v >= n ? s : ' '.repeat(n - v) + s
}

/** A faint horizontal rule. */
export function rule(width = DEFAULT_RULE_WIDTH): string {
  return INDENT + c.ash(RULE_CHAR.repeat(width))
}

export interface HeaderOpts {
  /** Render the brand mark (😈 OpenPact) before the title. Off by default. */
  brand?: boolean
}

/**
 * Section header line. By default just the bold title in brand colour with
 * an optional dim subtitle separated by a middle dot. Set `brand: true` for
 * the headline-moment variant that prefixes the OpenPact mark.
 */
export function header(title: string, subtitle?: string | null, opts: HeaderOpts = {}): string {
  const main = opts.brand ? `${mark()}  ${c.brandBold(title)}` : c.brandBold(title)
  return subtitle ? `${INDENT}${main}  ${c.ash('· ' + subtitle)}` : `${INDENT}${main}`
}

/** "Next:" footer with brand-coloured arrows and right-aligned commands. */
export function nextSteps(steps: ReadonlyArray<readonly [string, string]>): string {
  if (steps.length === 0) return ''
  const cmdW = Math.max(...steps.map(([cmd]) => visibleLength(cmd)))
  const lines = steps.map(
    ([cmd, desc]) => `${INDENT}${c.brand('→')}  ${padRight(cmd, cmdW)}  ${c.ash(desc)}`,
  )
  return [`${INDENT}${c.ash('Next')}`, ...lines].join('\n')
}

// ─── Card (key/value panel) ─────────────────────────────────────────────────

export interface CardSection {
  /** Optional sub-heading rendered above the rows in dim text. */
  heading?: string
  rows: ReadonlyArray<readonly [string, string]>
}

export interface CardOpts {
  title: string
  subtitle?: string | null
  sections: ReadonlyArray<CardSection>
  /** "Next steps" lines printed under the card. */
  next?: ReadonlyArray<readonly [string, string]>
  /** Free-form footer line(s) shown beneath the card and any next-steps block. */
  footer?: string | string[]
  /** Fixed label-column width. Defaults to the widest label across sections. */
  labelWidth?: number
}

/**
 * Render a key/value card with a brand title, faint rule, and right-aligned
 * labels. Labels share a column width across every section so values form a
 * crisp left-aligned column. Empty rows act as in-section spacers.
 */
export function card(opts: CardOpts): string {
  const labelW =
    opts.labelWidth ??
    Math.max(0, ...opts.sections.flatMap((s) => s.rows.map(([label]) => visibleLength(label))))

  const lines: string[] = [header(opts.title, opts.subtitle ?? undefined), rule()]

  opts.sections.forEach((section, i) => {
    if (i > 0) lines.push('')
    if (section.heading) {
      lines.push(`${INDENT}${c.ash(section.heading.toUpperCase())}`)
    }
    for (const [label, value] of section.rows) {
      if (label === '' && value === '') {
        lines.push('')
        continue
      }
      const lbl = c.ash(padLeft(label, labelW))
      lines.push(`${INDENT}${lbl}  ${value}`)
    }
  })

  if (opts.next && opts.next.length > 0) {
    lines.push('')
    lines.push(nextSteps(opts.next))
  }

  if (opts.footer) {
    const footers = Array.isArray(opts.footer) ? opts.footer : [opts.footer]
    lines.push('')
    for (const f of footers) lines.push(`${INDENT}${f}`)
  }

  return lines.join('\n')
}

// ─── Table ──────────────────────────────────────────────────────────────────

export interface Column<T> {
  header: string
  /** Cell value — may include ANSI; widths use the visible length. */
  value: (row: T) => string
  align?: 'left' | 'right'
  /** Optional colour wrapper applied to the padded cell text. */
  color?: (s: string) => string
  /** Minimum column width (in visible chars). */
  minWidth?: number
}

export interface TableOpts<T> {
  columns: ReadonlyArray<Column<T>>
  rows: ReadonlyArray<T>
  /** Optional title rendered above the table. */
  title?: string
  subtitle?: string | null
  /** Footer line(s) rendered below the table. */
  footer?: string | string[]
  /** Empty-state message used when `rows` is empty. */
  empty?: string
  /** Inter-column gap (visible chars). Defaults to 2. */
  gap?: number
}

/** Render a clean tabular block with a dim header row and a faint underline. */
export function table<T>(opts: TableOpts<T>): string {
  const { columns, rows } = opts
  const gap = opts.gap ?? 2

  if (rows.length === 0) {
    const lines: string[] = []
    if (opts.title) {
      lines.push(header(opts.title, opts.subtitle ?? undefined))
      lines.push(rule())
    }
    lines.push(`${INDENT}${c.ash(opts.empty ?? '(no rows)')}`)
    return lines.join('\n')
  }

  const widths = columns.map((col) => {
    const headerW = visibleLength(col.header)
    const rowMax = Math.max(0, ...rows.map((r) => visibleLength(col.value(r))))
    return Math.max(col.minWidth ?? 0, headerW, rowMax)
  })

  const sep = ' '.repeat(gap)
  const headerLine =
    INDENT +
    c.ash(
      columns
        .map((col, i) =>
          col.align === 'right'
            ? padLeft(col.header.toUpperCase(), widths[i])
            : padRight(col.header.toUpperCase(), widths[i]),
        )
        .join(sep),
    )
  const ruleLine = INDENT + c.ash(widths.map((w) => RULE_CHAR.repeat(w)).join(sep))
  const dataLines = rows.map(
    (row) =>
      INDENT +
      columns
        .map((col, i) => {
          const raw = col.value(row)
          const padded = col.align === 'right' ? padLeft(raw, widths[i]) : padRight(raw, widths[i])
          return col.color ? col.color(padded) : padded
        })
        .join(sep),
  )

  const lines: string[] = []
  if (opts.title) {
    lines.push(header(opts.title, opts.subtitle ?? undefined))
    lines.push(rule())
  }
  lines.push(headerLine, ruleLine, ...dataLines)
  if (opts.footer) {
    const footers = Array.isArray(opts.footer) ? opts.footer : [opts.footer]
    lines.push('')
    for (const f of footers) lines.push(`${INDENT}${f}`)
  }
  return lines.join('\n')
}

// ─── Status ─────────────────────────────────────────────────────────────────

const TYPE_COLOUR: Record<string, (s: string) => string> = {
  knowledge: c.brand,
  task: c.ember,
  skill: pc.magenta,
  message: pc.cyan,
}

export function formatStatus(s: StatusPayload, ctx?: StatusContext): string {
  const unknown = c.ash('—')
  const synced = s.synced ? c.brand('synced') : c.ember('not synced')
  const handle = s.peer_handle ?? unknown
  const agent = s.display_name
    ? `${c.bone(s.display_name)}  ${c.ash(`(${handle})`)}`
    : String(handle)
  const role = s.role ?? '?'

  const aliasValue = ctx
    ? `${ctx.alias}${ctx.alias === ctx.currentAlias ? '  ' + c.ash('(current)') : ''}  ${c.ash(`· ${ctx.totalPacts} pact${ctx.totalPacts === 1 ? '' : 's'} on this host`)}`
    : null

  const identity: Array<readonly [string, string]> = []
  if (s.pact_name) identity.push(['Pact', c.bone(s.pact_name)])
  if (aliasValue) identity.push(['Alias', aliasValue])
  if (s.pact_purpose) identity.push(['Purpose', c.ash(s.pact_purpose)])
  identity.push(['ID', s.pact_id ? c.ash(short(s.pact_id, 16)) : unknown])

  const presence: Array<readonly [string, string]> = [
    ['Agent', `${agent}  ${c.ash('· ' + role)}`],
    ['Agents', String(s.agents)],
    ['Entries', `${s.entries}  ${c.ash('·')} ${synced}`],
  ]

  const sections: CardSection[] = [{ rows: identity }, { rows: presence }]

  if (ctx) {
    sections.push({
      rows: [
        ['REST', c.ash(`http://127.0.0.1:${ctx.apiPort}/v1/pacts/${ctx.alias}/*`)],
        ['Dashboard', c.ash(`http://127.0.0.1:${ctx.dashboardPort}`)],
        ['PID', ctx.pid ? c.ash(String(ctx.pid)) : unknown],
        ['Data dir', c.ash(ctx.dataDir)],
      ],
    })
  }

  const subtitle = s.pact_name && ctx ? ctx.alias : null
  return card({
    title: s.pact_name ?? 'OpenPact',
    subtitle: s.pact_name ? subtitle : null,
    sections,
  })
}

export function formatHostStatus(s: HostStatusPayload, ctx: Omit<StatusContext, 'alias'>): string {
  const unknown = c.ash('—')
  const pactSummary =
    s.pact_count === 0
      ? `${s.pact_count}  ${c.ash('· No pacts yet')}`
      : `${s.pact_count}  ${c.ash(`· current ${s.current ?? 'none'}`)}`

  return card({
    title: 'OpenPact daemon',
    subtitle: 'Daemon is running',
    sections: [
      {
        rows: [
          ['Pacts', pactSummary],
          ['Agents', String(s.agents)],
        ],
      },
      {
        rows: [
          ['Daemon', c.ash(`http://127.0.0.1:${ctx.apiPort}/v1/*`)],
          ['Dashboard', c.ash(`http://127.0.0.1:${ctx.dashboardPort}`)],
          ['PID', ctx.pid ? c.ash(String(ctx.pid)) : unknown],
          ['Data dir', c.ash(ctx.dataDir)],
        ],
      },
    ],
  })
}

// ─── Agents ─────────────────────────────────────────────────────────────────

export function formatAgents(agents: AgentPayload[], opts: { alias?: string } = {}): string {
  return table({
    title: 'Agents',
    subtitle: opts.alias ?? null,
    columns: [
      {
        header: 'Handle',
        value: (a: AgentPayload) => c.bone(a.id),
        minWidth: 22,
      },
      {
        header: 'Remote key',
        value: (a: AgentPayload) => c.ash(short(a.remote_key, 16)),
        minWidth: 16,
      },
      {
        header: 'Status',
        value: (a: AgentPayload) => (a.online ? `${c.brand('●')} online` : `${c.ash('○')} offline`),
      },
    ],
    rows: agents,
    empty: 'No agents bound to this pact yet.',
  })
}

// ─── Log ────────────────────────────────────────────────────────────────────

export function formatLogLine(entry: LogEntry): string {
  const colour = TYPE_COLOUR[entry.type] ?? c.ash
  const summary = summarise(entry)
  return `${c.ash(entry.timestamp)}  ${colour(padRight(entry.type, 10))} ${entry.agent_id}  ${summary}`
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

// ─── Misc helpers ───────────────────────────────────────────────────────────

export function short(s: string, n = 12): string {
  return s.length <= n ? s : s.slice(0, n)
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

export function formatError(message: string): string {
  return `${emoji.cross} ${c.brand(message)}`
}
