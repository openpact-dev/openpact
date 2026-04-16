/**
 * Messages — the pact's dispatch roster.
 *
 * Structure: composer pinned at the top, chronological feed below
 * (NEWEST FIRST), and a segmented-control filter pinned at the bottom.
 * Only the feed scrolls; header, composer, and filter stay put.
 *
 * Each dispatch reads like a wire-service log entry: a left-column
 * stamp (entry id + relative time), a right column with author,
 * recipient, and body. Self-transmissions take a left ember rule.
 * There is no medallion rail and no chat-bubble split — the content
 * is the interface.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { PactlessState } from '../components/PactlessState'
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

type Filter = 'all' | 'broadcast' | 'direct'

const CHAR_MAX = 1000
/** Within this many px of the top = "still at top" → auto-pin new arrivals. */
const STICK_THRESHOLD = 80

export function Messages() {
  const pact = usePact()
  if (!pact.pactId) {
    return (
      <PactlessState
        page="Messages"
        action="Messages are the pact's broadcast wire. Open a pact to send and receive them."
      />
    )
  }
  return <MessagesPage />
}

function MessagesPage() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0

  const messages = useQuery(() => pact.messages.list({ limit: 500 }), {
    key: `messages:500:${pact.pactId}`,
    trigger,
  })
  const status = useQuery(() => pact.status(), { key: `msg:status:${pact.pactId}` })
  const peers = useQuery(() => pact.peers(), { key: `msg:peers:${pact.pactId}` })

  const [filter, setFilter] = useState<Filter>('all')

  // API returns the page envelope already newest-first (order: 'desc').
  const rows = useMemo<MessageRow[]>(() => {
    const all = (messages.data?.entries ?? []) as MessageRow[]
    if (filter === 'broadcast') return all.filter((m) => m.payload?.to === '*')
    if (filter === 'direct') return all.filter((m) => m.payload?.to && m.payload.to !== '*')
    return all
  }, [messages.data, filter])

  const counts = useMemo(() => {
    const all = (messages.data?.entries ?? []) as MessageRow[]
    const broadcast = all.filter((m) => m.payload?.to === '*').length
    const direct = all.length - broadcast
    return { all: all.length, broadcast, direct }
  }, [messages.data])

  const selfHandle = status.data?.peer_handle ?? ''
  const selfDisplay = status.data?.display_name ?? null

  /* Scroll behaviour for "newest-at-top" ---------------------------------
   * If the viewer is near the top, new dispatches pin the view there.
   * Otherwise a "N new ↑" pill floats at the top so they can come back.
   */

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const topIdRef = useRef<string | null>(null)
  const [atTop, setAtTop] = useState(true)
  const [unread, setUnread] = useState(0)

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollTop < STICK_THRESHOLD
    setAtTop(near)
    if (near) setUnread(0)
  }

  useEffect(() => {
    const newestId = rows[0]?.id ?? null
    const grew = newestId !== topIdRef.current
    topIdRef.current = newestId
    if (!grew) return
    const el = scrollRef.current
    if (!el) return
    if (atTop) {
      el.scrollTop = 0
    } else {
      setUnread((n) => n + 1)
    }
  }, [rows, atTop])

  const jumpToTop = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: 'smooth' })
    setUnread(0)
  }

  /* ---------------------------------------------------------------------- */

  return (
    <section
      data-testid="page-messages"
      class="mx-auto flex h-[calc(100vh-4rem)] max-w-[1180px] flex-col"
    >
      <header class="mb-4 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-3">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Messages
        </h1>
        <span class="font-mono text-[12px] text-[var(--color-ink3)]">
          {counts.all} dispatch{counts.all === 1 ? '' : 'es'}
        </span>
      </header>

      <Composer
        peers={(peers.data ?? []) as { id: string; display_name?: string | null }[]}
        selfHandle={selfHandle}
        onSent={() => {
          setAtTop(true)
          setUnread(0)
          messages.refetch()
        }}
      />

      {/* Stream — only this scrolls. */}
      <div class="relative mt-5 min-h-0 flex-1">
        <SectionLabel>
          Incoming <span class="text-[var(--color-ink3)]">·</span>{' '}
          <span class="text-[var(--color-ink3)]">newest first</span>
        </SectionLabel>
        <div
          ref={scrollRef as any}
          onScroll={onScroll}
          class="relative h-[calc(100%-1.75rem)] overflow-y-auto pr-1"
          data-testid="message-scroll"
        >
          {messages.loading && rows.length === 0 ? (
            <p class="py-10 text-[13px] text-[var(--color-ink3)]">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <Roster rows={rows} selfHandle={selfHandle} selfDisplay={selfDisplay} />
          )}

          {unread > 0 ? (
            <button
              type="button"
              onClick={jumpToTop}
              data-testid="jump-to-top"
              class="animate-etch fixed left-1/2 top-[8rem] z-10 -translate-x-1/2 rounded-full border-[0.5px] border-[var(--color-ember)] bg-[var(--color-paper)] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] shadow-md transition-colors hover:bg-[var(--color-ember)]/10"
            >
              ↑ {unread} new dispatch{unread === 1 ? '' : 'es'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Segmented filter pinned at the foot of the page. */}
      <Segmented filter={filter} setFilter={setFilter} counts={counts} />
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

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [content])

  const recipientLabel =
    to === '*' ? 'Everyone' : peers.find((p) => p.id === to)?.display_name || shortHandle(to)

  return (
    <div class="relative" data-testid="message-composer">
      {/* "New dispatch" eyebrow floating on the top border of the card. */}
      <span class="absolute left-4 top-0 -translate-y-1/2 bg-[var(--color-paper)] px-2 font-mono text-[9px] uppercase tracking-[0.28em] text-[var(--color-ember)]">
        New dispatch
      </span>

      <div class="border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/60">
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
          style={{ maxHeight: 160 }}
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
            <span class="mr-auto ml-4 font-mono text-[10px] text-[var(--color-ember)]">
              {error}
            </span>
          ) : null}
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            data-testid="message-send"
            class="rounded-sm border-[0.5px] border-[var(--color-ember)] px-4 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] transition-colors hover:bg-[var(--color-ember)]/10 disabled:cursor-not-allowed disabled:border-[var(--color-line)] disabled:text-[var(--color-ink3)] disabled:hover:bg-transparent"
          >
            {sending ? 'Transmitting…' : 'Transmit'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------- segmented filter -------------------------- */

function Segmented({
  filter,
  setFilter,
  counts,
}: {
  filter: Filter
  setFilter: (v: Filter) => void
  counts: { all: number; broadcast: number; direct: number }
}) {
  const opts: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'broadcast', label: 'Broadcast', count: counts.broadcast },
    { key: 'direct', label: 'Direct', count: counts.direct },
  ]
  const BASE =
    'inline-flex items-baseline gap-1.5 cursor-pointer rounded-full border-[0.5px] border-[var(--color-line)] bg-transparent px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)] transition-colors hover:text-[var(--color-ink)]'
  const ACTIVE =
    'border-[var(--color-ember)] bg-[var(--color-ember-soft)] text-[var(--color-ember)]'
  return (
    <div
      class="mt-4 flex items-center justify-between gap-4 border-t-[0.5px] border-[var(--color-line)] pt-3"
      role="group"
      aria-label="Filter dispatches"
    >
      <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
        Show
      </span>
      <div class="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const active = filter === o.key
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(o.key)}
              data-testid={`filter-${o.key}`}
              class={active ? `${BASE} ${ACTIVE}` : BASE}
            >
              <span>{o.label}</span>
              <span
                class={`tabular-nums ${
                  active ? 'text-[var(--color-ember)]/80' : 'text-[var(--color-ink3)]'
                }`}
              >
                {o.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------- roster -------------------------------- */

function Roster({
  rows,
  selfHandle,
  selfDisplay,
}: {
  rows: MessageRow[]
  selfHandle: string
  selfDisplay: string | null
}) {
  // Insert day dividers between dispatches that cross midnight.
  return (
    <ol class="divide-y-[0.5px] divide-[var(--color-line)]" data-testid="message-list">
      {rows.map((m, i) => {
        const prev = rows[i - 1] // previous = more recent (newer) when newest-first
        const dayBreak = !prev || !sameDay(prev.timestamp, m.timestamp)
        return (
          <DispatchRow
            key={m.id ?? `${m.timestamp}-${i}`}
            msg={m}
            index={i}
            isSelf={m.agent_id === selfHandle}
            selfDisplay={selfDisplay}
            dayBreak={dayBreak}
          />
        )
      })}
    </ol>
  )
}

function DispatchRow({
  msg,
  index,
  isSelf,
  selfDisplay,
  dayBreak,
}: {
  msg: MessageRow
  index: number
  isSelf: boolean
  selfDisplay: string | null
  dayBreak: boolean
}) {
  const isBroadcast = msg.payload?.to === '*'
  const author = preferredName({ agent_id: msg.agent_id, display_name: msg.display_name })
  const recipientLabel = isBroadcast
    ? 'Broadcast'
    : `→ ${msg.payload.to === selfDisplay ? 'Self' : shortHandle(msg.payload.to)}`

  return (
    <>
      {dayBreak ? <DayDivider iso={msg.timestamp} /> : null}
      <li
        class="animate-etch"
        style={{ animationDelay: `${Math.min(index * 18, 420)}ms` }}
        data-testid={isBroadcast ? 'dispatch-broadcast' : 'dispatch-direct'}
      >
        <article
          class={`grid gap-5 py-4 md:grid-cols-[120px_1fr] ${
            isSelf ? 'border-l-2 border-l-[var(--color-ember)] pl-4' : 'pl-0'
          }`}
        >
          {/* Left column: postmark (id + time). Monospaced, hushed. */}
          <div class="flex flex-col gap-1 pt-0.5">
            {msg.id ? (
              <a
                href={`/trace/${msg.id}`}
                class="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink2)] transition-colors hover:text-[var(--color-ember)]"
                title="View entry trace"
              >
                #{msg.id}
              </a>
            ) : (
              <span class="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
                —
              </span>
            )}
            <span
              class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]"
              title={new Date(msg.timestamp).toLocaleString()}
            >
              {relTime(msg.timestamp)}
            </span>
          </div>

          {/* Right column: author / recipient / body. */}
          <div class="min-w-0">
            <header class="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                class="font-display text-[16px] leading-none text-[var(--color-ink)]"
                title={msg.agent_id}
              >
                {author}
              </span>
              {isSelf ? (
                <span class="border-[0.5px] border-[var(--color-ember)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ember)]">
                  Self
                </span>
              ) : null}
              <span
                class={`font-mono text-[10px] uppercase tracking-[0.18em] ${
                  isBroadcast ? 'text-[var(--color-ember)]' : 'text-[var(--color-ink2)]'
                }`}
              >
                {recipientLabel}
              </span>
            </header>
            <p class="whitespace-pre-wrap font-display text-[16px] leading-[1.55] text-[var(--color-ink)]">
              {msg.payload.content}
            </p>
          </div>
        </article>
      </li>
    </>
  )
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <li class="list-none pb-2 pt-3 first:pt-1">
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

function SectionLabel({ children }: { children: any }) {
  return (
    <div class="mb-1 flex items-baseline gap-2">
      <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
        {children}
      </span>
    </div>
  )
}

/* ----------------------------- helpers --------------------------------- */

function EmptyState({ filter }: { filter: Filter }) {
  const label =
    filter === 'broadcast' ? 'broadcasts' : filter === 'direct' ? 'direct dispatches' : 'dispatches'
  return (
    <div
      class="mx-auto my-16 max-w-md border-[0.5px] border-dashed border-[var(--color-line)] px-6 py-12 text-center"
      data-testid="messages-empty"
    >
      <p class="font-display text-[18px] italic text-[var(--color-ink3)]">No {label} yet.</p>
      <p class="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
        Transmit the first one above.
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
