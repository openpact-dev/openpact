/**
 * Messages — the pact's shared dispatch stream.
 *
 * Traditional messaging-app layout: a full-height column with a
 * scrollable stream (oldest → newest, top → bottom) and a composer
 * pinned at the bottom. New dispatches arrive live via SSE; if the
 * viewer is near the bottom, they auto-scroll. If they've scrolled up
 * to read older transmissions, a "Jump to latest" pill appears so
 * they can come back without losing their place.
 *
 * The left-edge rail carries a small rotated-square medallion per
 * dispatch, tinted by a stable hash of the sender's handle, so the
 * eye can follow one agent's line when the stream is busy.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { relTime, preferredName, shortHandle } from '../lib/format'

interface MessageRow {
  id?: string
  timestamp: string
  agent_id: string
  display_name?: string | null
  payload: {
    to: string
    content: string
    priority?: 'low' | 'normal' | 'high'
    [k: string]: unknown
  }
}

const CHAR_MAX = 1000
/** Distance from the bottom (in px) that counts as "near bottom". */
const STICKY_THRESHOLD = 80

export function Messages() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0

  const messages = useQuery(() => pact.messages.list({ limit: 500 }), {
    key: `messages:500:${pact.pactId}`,
    trigger,
  })
  const status = useQuery(() => pact.status(), { key: `msg:status:${pact.pactId}` })
  const peers = useQuery(() => pact.peers(), { key: `msg:peers:${pact.pactId}` })

  const [filter, setFilter] = useState<'all' | 'broadcast' | 'direct'>('all')

  // API returns reverse-chronological (newest first). Reverse to get a
  // traditional top-to-bottom chat flow.
  const rows = useMemo<MessageRow[]>(() => {
    const all = [...((messages.data ?? []) as MessageRow[])].reverse()
    if (filter === 'broadcast') return all.filter((m) => m.payload?.to === '*')
    if (filter === 'direct') return all.filter((m) => m.payload?.to && m.payload.to !== '*')
    return all
  }, [messages.data, filter])

  const counts = useMemo(() => {
    const all = (messages.data ?? []) as MessageRow[]
    const broadcast = all.filter((m) => m.payload?.to === '*').length
    const direct = all.length - broadcast
    return { all: all.length, broadcast, direct }
  }, [messages.data])

  const selfHandle = status.data?.peer_handle ?? ''
  const selfDisplay = status.data?.display_name ?? null

  /* --- scroll management ------------------------------------------------ */

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastIdRef = useRef<string | null>(null)
  const [sticky, setSticky] = useState(true)
  const [unread, setUnread] = useState(0)

  // Is the viewer near the bottom? We only auto-scroll when they are.
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const near = distance < STICKY_THRESHOLD
    setSticky(near)
    if (near) setUnread(0)
  }

  // After any rows change: if sticky, pin to the bottom; otherwise
  // count new arrivals so the "Jump to latest" pill can show a badge.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const newest = rows[rows.length - 1]?.id ?? null
    const grew = newest !== lastIdRef.current
    lastIdRef.current = newest
    if (!grew) return
    if (sticky) {
      el.scrollTop = el.scrollHeight
    } else {
      setUnread((n) => n + 1)
    }
  }, [rows, sticky])

  // On initial load, jump to the bottom once the first batch is in.
  const firstLoadRef = useRef(true)
  useEffect(() => {
    if (firstLoadRef.current && rows.length > 0) {
      firstLoadRef.current = false
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [rows])

  const jumpToLatest = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setUnread(0)
  }

  /* ---------------------------------------------------------------------- */

  return (
    <section
      data-testid="page-messages"
      class="mx-auto flex h-[calc(100vh-4rem)] max-w-[1180px] flex-col"
    >
      <header class="mb-4 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Messages
        </h1>
        <span class="font-mono text-[12px] text-[var(--color-ink3)]">
          {counts.all} dispatch{counts.all === 1 ? '' : 'es'}
        </span>
      </header>

      <FilterStrip filter={filter} setFilter={setFilter} counts={counts} />

      <div
        ref={scrollRef as any}
        onScroll={onScroll}
        class="relative min-h-0 flex-1 overflow-y-auto pr-2"
        data-testid="message-scroll"
      >
        {messages.loading && rows.length === 0 ? (
          <p class="px-1 py-8 text-[13px] text-[var(--color-ink3)]">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <Timeline rows={rows} selfHandle={selfHandle} selfDisplay={selfDisplay} />
        )}

        {unread > 0 ? (
          <button
            type="button"
            onClick={jumpToLatest}
            data-testid="jump-to-latest"
            class="sticky bottom-3 left-1/2 block -translate-x-1/2 rounded-full border-[0.5px] border-[var(--color-ember)] bg-[var(--color-paper)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] shadow-md transition-colors hover:bg-[var(--color-ember)]/10"
          >
            {unread} new · Jump to latest ↓
          </button>
        ) : null}
      </div>

      <Composer
        peers={(peers.data ?? []) as { id: string; display_name?: string | null }[]}
        selfHandle={selfHandle}
        onSent={() => {
          setSticky(true)
          setUnread(0)
          messages.refetch()
        }}
      />
    </section>
  )
}

/* ------------------------------ composer ------------------------------- */

function Composer({
  peers,
  selfHandle,
  onSent,
}: {
  peers: { id: string; display_name?: string | null }[]
  selfHandle: string
  onSent: () => void
}) {
  const pact = usePact()
  const [to, setTo] = useState<string>('*')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  const trimmed = content.trim()
  const canSend = trimmed.length > 0 && trimmed.length <= CHAR_MAX && !sending

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await pact.messages.send({ to, content: trimmed })
      setContent('')
      onSent()
      // Keep focus in the textarea for rapid-fire transmissions.
      taRef.current?.focus()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void send()
    }
  }

  // Auto-resize textarea up to ~6 lines so the composer never eats the
  // stream above it.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [content])

  const recipientLabel =
    to === '*'
      ? 'Everyone'
      : peers.find((p) => p.id === to)?.display_name || shortHandle(to)

  return (
    <div
      class="mt-3 border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/60 shadow-[0_-1px_0_0_var(--color-line)]"
      data-testid="message-composer"
    >
      <div class="flex items-center gap-3 border-b-[0.5px] border-[var(--color-line)] px-4 py-2">
        <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
          To
        </span>
        <select
          value={to}
          onChange={(e) => setTo((e.target as HTMLSelectElement).value)}
          class="flex-1 appearance-none rounded-none border-0 bg-transparent px-0 py-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-ember)] outline-none"
          data-testid="message-recipient"
        >
          <option value="*">Everyone in the pact</option>
          {peers
            .filter((p) => p.id && p.id !== selfHandle)
            .map((p) => (
              <option key={p.id} value={p.id}>
                → {p.display_name || shortHandle(p.id)}
              </option>
            ))}
        </select>
        <span class="font-mono text-[10px] text-[var(--color-ink3)]" aria-live="polite">
          {recipientLabel}
        </span>
      </div>

      <textarea
        ref={taRef as any}
        value={content}
        onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
        onKeyDown={handleKey as any}
        placeholder={
          to === '*' ? 'Transmit to every agent in this pact…' : 'Send a direct dispatch…'
        }
        rows={2}
        data-testid="message-textarea"
        class="block w-full resize-none border-0 bg-transparent px-4 py-3 font-display text-[15px] leading-[1.55] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink3)]"
        style={{ maxHeight: 140 }}
      />

      <div class="flex items-center justify-between border-t-[0.5px] border-[var(--color-line)] px-4 py-2">
        <span
          class={`font-mono text-[10px] uppercase tracking-[0.14em] ${
            trimmed.length > CHAR_MAX ? 'text-[var(--color-ember)]' : 'text-[var(--color-ink3)]'
          }`}
        >
          {trimmed.length}/{CHAR_MAX}
          <span class="ml-3 text-[var(--color-ink3)]">⌘↵ to send</span>
        </span>
        {error ? (
          <span class="mr-auto ml-4 font-mono text-[10px] text-[var(--color-ember)]">{error}</span>
        ) : null}
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          data-testid="message-send"
          class="rounded-sm border-[0.5px] border-[var(--color-ember)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] transition-colors hover:bg-[var(--color-ember)]/10 disabled:cursor-not-allowed disabled:border-[var(--color-line)] disabled:text-[var(--color-ink3)] disabled:hover:bg-transparent"
        >
          {sending ? 'Transmitting…' : 'Transmit'}
        </button>
      </div>
    </div>
  )
}

/* ---------------------------- filter strip ----------------------------- */

function FilterStrip({
  filter,
  setFilter,
  counts,
}: {
  filter: 'all' | 'broadcast' | 'direct'
  setFilter: (v: 'all' | 'broadcast' | 'direct') => void
  counts: { all: number; broadcast: number; direct: number }
}) {
  const opts: Array<{ key: 'all' | 'broadcast' | 'direct'; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'broadcast', label: 'Broadcast', count: counts.broadcast },
    { key: 'direct', label: 'Direct', count: counts.direct },
  ]
  return (
    <div class="mb-3 flex items-center gap-4 border-b-[0.5px] border-[var(--color-line)] pb-2">
      {opts.map((o) => {
        const active = filter === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => setFilter(o.key)}
            data-testid={`filter-${o.key}`}
            class={`font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
              active
                ? 'text-[var(--color-ember)]'
                : 'text-[var(--color-ink3)] hover:text-[var(--color-ink)]'
            }`}
          >
            {o.label}
            <span
              class={`ml-1.5 tabular-nums ${
                active ? 'text-[var(--color-ember)]' : 'text-[var(--color-ink3)]'
              }`}
            >
              ({o.count})
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ timeline ------------------------------- */

function Timeline({
  rows,
  selfHandle,
  selfDisplay,
}: {
  rows: MessageRow[]
  selfHandle: string
  selfDisplay: string | null
}) {
  // Group adjacent messages from the same agent with no break in time
  // so the stream feels like a conversation, not a list.
  return (
    <div class="relative pl-5 pr-3 pt-2">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute bottom-0 left-[3px] top-0 w-px bg-[var(--color-line)]"
      />
      <ol class="space-y-3" data-testid="message-list">
        {rows.map((m, i) => {
          const prev = rows[i - 1]
          const continuation =
            !!prev && prev.agent_id === m.agent_id && prev.payload?.to === m.payload?.to
          const dayBreak = !prev || !sameDay(prev.timestamp, m.timestamp)
          return (
            <Dispatch
              key={m.id ?? `${m.timestamp}-${i}`}
              msg={m}
              index={i}
              isSelf={m.agent_id === selfHandle}
              selfDisplay={selfDisplay}
              continuation={continuation}
              dayBreak={dayBreak}
            />
          )
        })}
      </ol>
    </div>
  )
}

function Dispatch({
  msg,
  index,
  isSelf,
  selfDisplay,
  continuation,
  dayBreak,
}: {
  msg: MessageRow
  index: number
  isSelf: boolean
  selfDisplay: string | null
  continuation: boolean
  dayBreak: boolean
}) {
  const isBroadcast = msg.payload?.to === '*'
  const author = preferredName({ agent_id: msg.agent_id, display_name: msg.display_name })
  const color = agentColor(msg.agent_id)

  return (
    <>
      {dayBreak ? <DayDivider iso={msg.timestamp} /> : null}
      <li
        class="animate-etch relative"
        style={{ animationDelay: `${Math.min(index * 20, 400)}ms` }}
        data-testid={isBroadcast ? 'dispatch-broadcast' : 'dispatch-direct'}
      >
        {/* Medallion on the rail, tinted per-agent. Hidden on continuations
            to let the stream breathe. */}
        {!continuation ? (
          <span
            aria-hidden="true"
            class="absolute -left-[calc(20px-1px)] top-2 block h-[7px] w-[7px] rotate-45 border border-[var(--color-paper)]"
            style={{ background: color }}
          />
        ) : null}

        <article
          class={`relative border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/30 px-5 py-3 ${
            isBroadcast ? '' : 'ml-8'
          } ${isSelf ? 'border-l-2 border-l-[var(--color-ember)]' : ''}`}
        >
          {!continuation ? (
            <header class="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div class="flex items-baseline gap-2">
                <span
                  class="font-display text-[15px] leading-none text-[var(--color-ink)]"
                  title={msg.agent_id}
                >
                  {author}
                </span>
                {isSelf ? (
                  <span class="border-[0.5px] border-[var(--color-ember)] px-1 py-[1px] font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ember)]">
                    Self
                  </span>
                ) : null}
                <span
                  class="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink3)]"
                  title={new Date(msg.timestamp).toLocaleString()}
                >
                  · {relTime(msg.timestamp)}
                </span>
              </div>
              <div class="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em]">
                {isBroadcast ? (
                  <span class="text-[var(--color-ember)]">Broadcast</span>
                ) : (
                  <span class="text-[var(--color-ink2)]">
                    → {msg.payload.to === selfDisplay ? 'Self' : shortHandle(msg.payload.to)}
                  </span>
                )}
                {msg.id ? (
                  <a
                    href={`/trace/${msg.id}`}
                    class="text-[var(--color-ink3)] transition-colors hover:text-[var(--color-ember)]"
                    title="View entry trace"
                  >
                    #{msg.id}
                  </a>
                ) : null}
              </div>
            </header>
          ) : null}
          <p class="whitespace-pre-wrap font-display text-[16px] leading-[1.55] text-[var(--color-ink)]">
            {msg.payload.content}
          </p>
        </article>
      </li>
    </>
  )
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <li class="pointer-events-none list-none pt-4 first:pt-0">
      <div class="flex items-center gap-3">
        <div class="h-px flex-1 bg-[var(--color-line)]" />
        <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
          {formatDay(iso)}
        </span>
        <div class="h-px flex-1 bg-[var(--color-line)]" />
      </div>
    </li>
  )
}

/* ----------------------------- helpers --------------------------------- */

function EmptyState({ filter }: { filter: 'all' | 'broadcast' | 'direct' }) {
  const label =
    filter === 'broadcast'
      ? 'broadcasts'
      : filter === 'direct'
        ? 'direct dispatches'
        : 'dispatches'
  return (
    <div
      class="mx-auto my-16 max-w-md border-[0.5px] border-dashed border-[var(--color-line)] px-6 py-12 text-center"
      data-testid="messages-empty"
    >
      <p class="font-display text-[18px] italic text-[var(--color-ink3)]">No {label} yet.</p>
      <p class="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
        Transmit the first one below.
      </p>
    </div>
  )
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDate = (x: Date, y: Date) =>
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  if (sameDate(d, today)) return 'Today'
  if (sameDate(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Deterministic per-agent accent colour derived from the handle. Same
 * handle → same colour, always.
 */
function agentColor(handle: string): string {
  const palette = [
    'var(--color-ember)',
    'var(--color-online)',
    '#6a5acd',
    '#c98a5a',
    '#7a9b7e',
    '#b57b8a',
    '#5a8ca5',
    '#a78bfa',
  ]
  let h = 0
  for (let i = 0; i < handle.length; i++) {
    h = (h * 31 + handle.charCodeAt(i)) >>> 0
  }
  return palette[h % palette.length]
}
