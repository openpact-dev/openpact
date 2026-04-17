import { Command } from 'commander'
import { OpenPact } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact, NoPactsError } from '../lib/pact-select'
import { cursorPath, readCursor, writeCursor, type HookCursor } from '../lib/hook-cursor'

export interface HookOpts {
  pact?: string
  port?: string | number
}

/**
 * Stdin shape Claude Code sends to every hook. We only use `cwd` (to
 * key per-project state). Everything else is accepted and ignored so
 * future Claude Code additions do not break us.
 */
interface HookInput {
  cwd?: string
  session_id?: string
  hook_event_name?: string
  prompt?: string
  [key: string]: unknown
}

export function registerHookCommand(parent: Command): void {
  const hook = parent
    .command('hook')
    .description('hook runtime invoked by Claude Code (wired via `openpact install claude-code`)')

  hook
    .command('session-start')
    .description('emit pact orientation context at the start of a Claude Code session')
    .option('--pact <alias>', 'pact to read (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action((opts: HookOpts, cmd: { optsWithGlobals(): GlobalCliOpts }) =>
      runHook('session-start', opts, cmd),
    )

  hook
    .command('prompt-submit')
    .description('emit peer activity since the last turn before each user prompt')
    .option('--pact <alias>', 'pact to read (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action((opts: HookOpts, cmd: { optsWithGlobals(): GlobalCliOpts }) =>
      runHook('prompt-submit', opts, cmd),
    )
}

async function runHook(
  event: 'session-start' | 'prompt-submit',
  opts: HookOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  try {
    const hostDir = resolveDataDir(cmd.optsWithGlobals())
    const input = await readStdinJson()
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
    const alias = await resolveCurrentPact(hostDir, opts.pact)
    const port = Number(opts.port ?? 7666)

    const client = new OpenPact({ port, pactId: alias, hostDir })
    const file = cursorPath(hostDir, cwd, alias)
    const cursor = await readCursor(file)

    if (event === 'session-start') {
      const context = await buildSessionContext(client)
      if (context) emitHookOutput('SessionStart', context)
      // Advance cursor to "now" so the very next prompt-submit does not
      // immediately re-show everything we just surfaced.
      await writeCursor(file, { lastSeen: nowIso(), pactId: alias, cwd })
      return
    }

    // prompt-submit: bootstrap silently on first run.
    if (!cursor) {
      await writeCursor(file, { lastSeen: nowIso(), pactId: alias, cwd })
      return
    }

    const context = await buildPromptContext(client, cursor)
    if (context) emitHookOutput('UserPromptSubmit', context)
    await writeCursor(file, { lastSeen: nowIso(), pactId: alias, cwd })
  } catch (err) {
    // Never block the user's session. Log a single diagnostic line to
    // stderr (Claude Code shows the first line on non-zero exit; we
    // exit 0 so nothing blocks) and emit no context.
    if (err instanceof NoPactsError) {
      // Brand-new host, no pacts yet. Stay completely silent.
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`openpact hook ${event}: ${msg}\n`)
  }
}

async function buildSessionContext(client: OpenPact): Promise<string | null> {
  const [status, agentsList, tasksPage, messagesPage] = await Promise.all([
    client.status(),
    client.agents(),
    client.tasks.list({ status: 'open', order: 'desc', limit: 5 }),
    client.messages.list({ order: 'desc', limit: 10 }),
  ])

  const me = status.peer_handle
  const lines: string[] = []
  const name = status.pact_name || status.pact_id?.slice(0, 8) || 'pact'
  const onlineAgents = agentsList.filter((a) => a.online && a.id !== me)

  lines.push('## OpenPact shared memory')
  lines.push('')
  lines.push(`Pact: ${name}`)
  if (status.pact_purpose) lines.push(`Purpose: ${status.pact_purpose}`)
  lines.push(`Your handle: ${me ?? '(unknown)'}`)
  lines.push(
    `Peers online: ${onlineAgents.length}${
      onlineAgents.length
        ? ` — ${onlineAgents.map((a) => handleLabel(a.id, a.display_name)).join(', ')}`
        : ''
    }`,
  )

  const openTasks = tasksPage.entries
  if (openTasks.length > 0) {
    lines.push('')
    lines.push(`Open tasks (${openTasks.length}):`)
    for (const task of openTasks.slice(0, 5)) {
      lines.push(`- ${task.id} — ${task.title}`)
    }
  }

  const peerMessages = messagesPage.entries.filter((m) => m.agent_id !== me).slice(0, 3)
  if (peerMessages.length > 0) {
    lines.push('')
    lines.push('Recent messages from peers:')
    for (const m of peerMessages) {
      lines.push(
        `- ${shortTs(m.timestamp)} ${handleLabel(m.agent_id, m.display_name ?? null)}: ${m.payload.content}`,
      )
    }
  }

  lines.push('')
  lines.push(
    'Read/write recipes are in CLAUDE.md (curl against http://127.0.0.1:7666). Check this memory before making non-obvious decisions.',
  )

  return lines.join('\n')
}

async function buildPromptContext(client: OpenPact, cursor: HookCursor): Promise<string | null> {
  const since = cursor.lastSeen
  const [status, messagesPage, knowledgePage, tasksPage] = await Promise.all([
    client.status(),
    client.messages.list({ order: 'desc', limit: 30, since }),
    client.knowledge.list({ order: 'desc', limit: 30 }),
    client.tasks.list({ order: 'desc', limit: 30 }),
  ])
  const me = status.peer_handle

  const newMessages = messagesPage.entries.filter((m) => m.agent_id !== me && m.timestamp > since)
  const newKnowledge = knowledgePage.entries.filter((k) => k.agent_id !== me && k.timestamp > since)
  const newTasks = tasksPage.entries.filter((t) => {
    const creator = t.history?.[0]
    return creator && creator.agent_id !== me && creator.timestamp > since
  })

  if (newMessages.length + newKnowledge.length + newTasks.length === 0) return null

  const lines: string[] = []
  lines.push('## OpenPact activity since your last turn')

  if (newMessages.length > 0) {
    lines.push('')
    lines.push('Messages from peers:')
    for (const m of newMessages.slice(0, 8)) {
      lines.push(
        `- ${shortTs(m.timestamp)} ${handleLabel(m.agent_id, m.display_name ?? null)}: ${m.payload.content}`,
      )
    }
  }

  if (newTasks.length > 0) {
    lines.push('')
    lines.push('New tasks:')
    for (const t of newTasks.slice(0, 5)) {
      const creator = t.history?.[0]
      const who = creator ? handleLabel(creator.agent_id, creator.display_name ?? null) : 'unknown'
      lines.push(`- ${t.id} — ${t.title} (by ${who})`)
    }
  }

  if (newKnowledge.length > 0) {
    lines.push('')
    lines.push('New knowledge:')
    for (const k of newKnowledge.slice(0, 5)) {
      const who = handleLabel(k.agent_id, k.display_name ?? null)
      lines.push(`- topic=${k.payload.topic} (${who}): ${truncate(k.payload.content, 160)}`)
    }
  }

  return lines.join('\n')
}

function emitHookOutput(
  event: 'SessionStart' | 'UserPromptSubmit',
  additionalContext: string,
): void {
  const payload = {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext,
    },
  }
  process.stdout.write(JSON.stringify(payload) + '\n')
}

async function readStdinJson(): Promise<HookInput> {
  if (process.stdin.isTTY) return {}
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as HookInput)
      : {}
  } catch {
    return {}
  }
}

function handleLabel(id: string, displayName: string | null | undefined): string {
  if (displayName && displayName.trim() !== '') return `${displayName} (${id})`
  return id
}

function shortTs(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso)
  return m ? `${m[1]} ${m[2]}` : iso
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

function nowIso(): string {
  return new Date().toISOString()
}

// Exported for unit testing only.
export const _internals = {
  buildSessionContext,
  buildPromptContext,
  handleLabel,
  shortTs,
  truncate,
}
