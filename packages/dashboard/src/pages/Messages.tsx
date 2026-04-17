/**
 * Messages — the pact's dispatch roster.
 *
 * Structure: composer pinned at the top, chronological feed below
 * (NEWEST FIRST). Only the feed scrolls; header and composer stay put.
 *
 * Each dispatch reads like a wire-service log entry: a left-column
 * stamp (entry id + relative time), a right column with author and
 * body. Self-transmissions take a left ember rule. Every dispatch is
 * a pact-wide broadcast — no per-recipient addressing.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSharedSse } from '../hooks/useSse'
import { useTraceDialog } from '../hooks/useTraceDialog'
import { Markdown } from '../components/Markdown'
import { PactlessState } from '../components/PactlessState'
import { eventSeqForPact } from '../lib/events'
import { relTime, preferredName } from '../lib/format'

interface MessageRow {
  id?: string
  timestamp: string
  agent_id: string
  display_name?: string | null
  /**
   * When set, this message replies to `refs[0]`. The daemon hoists
   * the `reply_to` POST-body field onto `refs`; the dashboard groups
   * replies under their parent in Roster.
   */
  refs?: string[]
  payload: {
    content: string
    priority?: 'low' | 'normal' | 'high'
    [k: string]: unknown
  }
}

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
  const sse = useSharedSse()
  const trigger = eventSeqForPact(sse.last, pact.pactId, [
    'entry-applied',
    'member-online',
    'member-offline',
    'update',
  ])

  const messages = useQuery(() => pact.messages.list({ limit: 500 }), {
    key: `messages:500:${pact.pactId}`,
    trigger,
  })
  const status = useQuery(() => pact.status(), { key: `msg:status:${pact.pactId}`, trigger })

  // API returns the page envelope already newest-first (order: 'desc').
  const rows = useMemo<MessageRow[]>(
    () => (messages.data?.entries ?? []) as MessageRow[],
    [messages.data],
  )
  const total = rows.length

  const selfHandle = status.data?.peer_handle ?? ''

  /* Scroll behaviour for "newest-at-top" ---------------------------------
   * If the viewer is near the top, new dispatches pin the view there.
   * Otherwise a "N new ↑" pill floats at the top so they can come back.
   */

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const topIdRef = useRef<string | null>(null)
  const [atTop, setAtTop] = useState(true)
  const [unread, setUnread] = useState(0)
  // Replying threads a new dispatch under an existing one. Cleared
  // after send or via the pill's × button.
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null)

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
          {total} dispatch{total === 1 ? '' : 'es'}
        </span>
      </header>

      <Composer
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSent={() => {
          setAtTop(true)
          setUnread(0)
          setReplyingTo(null)
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
            <EmptyState />
          ) : (
            <Roster rows={rows} selfHandle={selfHandle} onReply={(msg) => setReplyingTo(msg)} />
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
    </section>
  )
}

/* ------------------------------ composer ------------------------------- */

function Composer({
  onSent,
  replyingTo,
  onCancelReply,
}: {
  onSent: () => void
  replyingTo: MessageRow | null
  onCancelReply: () => void
}) {
  const pact = usePact()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  const trimmed = content.trim()
  const canSend = trimmed.length > 0 && trimmed.length <= CHAR_MAX && !sending

  // When replyingTo is set, focus the textarea so the user can type
  // immediately after clicking Reply on a dispatch.
  useEffect(() => {
    if (replyingTo?.id) taRef.current?.focus()
  }, [replyingTo?.id])

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await pact.messages.send({
        content: trimmed,
        ...(replyingTo?.id ? { reply_to: replyingTo.id } : {}),
      })
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

  return (
    <div class="relative" data-testid="message-composer">
      {/* "New dispatch" eyebrow floating on the top border of the card. */}
      <span class="absolute left-4 top-0 -translate-y-1/2 bg-[var(--color-paper)] px-2 font-mono text-[9px] uppercase tracking-[0.28em] text-[var(--color-ember)]">
        {replyingTo ? 'Reply' : 'New dispatch'}
      </span>

      <div class="border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/60">
        {replyingTo ? (
          <div
            class="flex items-center gap-2 border-b-[0.5px] border-[var(--color-line)] bg-[var(--color-mist)]/20 px-4 py-2 font-mono text-[11px] text-[var(--color-ink2)]"
            data-testid="composer-reply-target"
          >
            <span class="uppercase tracking-[0.18em] text-[var(--color-ink3)]">↪ Replying to</span>
            <span class="text-[var(--color-ember)]">#{replyingTo.id}</span>
            <span class="truncate italic text-[var(--color-ink3)]">
              “{replyingTo.payload.content.slice(0, 80)}
              {replyingTo.payload.content.length > 80 ? '…' : ''}”
            </span>
            <button
              type="button"
              onClick={onCancelReply}
              class="ml-auto font-mono text-[11px] text-[var(--color-ink3)] hover:text-[var(--color-ember)]"
              title="Cancel reply"
              data-testid="composer-cancel-reply"
            >
              ×
            </button>
          </div>
        ) : null}
        <textarea
          ref={taRef as any}
          value={content}
          onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKey as any}
          placeholder={
            replyingTo ? `Reply to #${replyingTo.id}…` : 'Broadcast to every agent in this pact…'
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
            <span class="ml-3 text-[var(--color-ink3)]">Markdown supported</span>
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

/* ------------------------------- roster -------------------------------- */

function Roster({
  rows,
  selfHandle,
  onReply,
}: {
  rows: MessageRow[]
  selfHandle: string
  onReply: (msg: MessageRow) => void
}) {
  // Thread grouping:
  //   rootOrder keeps the top-level (newest-first) sequence from `rows`.
  //   childrenOf[parentId] holds replies in chronological order (oldest
  //   first) so a conversation reads naturally under the parent.
  // A reply whose parent isn't in this page falls back to being rendered
  // as a top-level row with a dim "↰ reply to <id>" hint; it otherwise
  // stays in the newest-first stream so you don't lose the reply itself.
  const ids = useMemo(() => new Set(rows.map((r) => r.id).filter(Boolean) as string[]), [rows])
  const { rootOrder, childrenOf } = useMemo(() => {
    const childrenOf = new Map<string, MessageRow[]>()
    const rootOrder: MessageRow[] = []
    for (const m of rows) {
      const parent = m.refs?.[0]
      if (parent && ids.has(parent)) {
        const bucket = childrenOf.get(parent) ?? []
        bucket.push(m)
        childrenOf.set(parent, bucket)
      } else {
        rootOrder.push(m)
      }
    }
    // Sort each thread oldest-first (chronological) — readable order for
    // back-and-forth even though the outer stream stays newest-first.
    for (const kids of childrenOf.values()) {
      kids.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    }
    return { rootOrder, childrenOf }
  }, [rows, ids])

  return (
    <ol class="divide-y-[0.5px] divide-[var(--color-line)]" data-testid="message-list">
      {rootOrder.map((m, i) => {
        const prev = rootOrder[i - 1]
        const dayBreak = !prev || !sameDay(prev.timestamp, m.timestamp)
        const replies = m.id ? childrenOf.get(m.id) : undefined
        return (
          <DispatchGroup
            key={m.id ?? `${m.timestamp}-${i}`}
            msg={m}
            index={i}
            isSelf={m.agent_id === selfHandle}
            dayBreak={dayBreak}
            replies={replies}
            selfHandle={selfHandle}
            onReply={onReply}
          />
        )
      })}
    </ol>
  )
}

function DispatchGroup({
  msg,
  index,
  isSelf,
  dayBreak,
  replies,
  selfHandle,
  onReply,
}: {
  msg: MessageRow
  index: number
  isSelf: boolean
  dayBreak: boolean
  replies: MessageRow[] | undefined
  selfHandle: string
  onReply: (msg: MessageRow) => void
}) {
  return (
    <>
      <DispatchRow msg={msg} index={index} isSelf={isSelf} dayBreak={dayBreak} onReply={onReply} />
      {replies && replies.length > 0 ? (
        <li class="list-none" data-testid="thread-replies">
          <ol class="ml-10 border-l-[0.5px] border-[var(--color-line)] pl-5">
            {replies.map((reply, j) => (
              <DispatchRow
                key={reply.id ?? `${reply.timestamp}-${j}`}
                msg={reply}
                index={j}
                isSelf={reply.agent_id === selfHandle}
                dayBreak={false}
                onReply={onReply}
                threaded
              />
            ))}
          </ol>
        </li>
      ) : null}
    </>
  )
}

function DispatchRow({
  msg,
  index,
  isSelf,
  dayBreak,
  onReply,
  threaded = false,
}: {
  msg: MessageRow
  index: number
  isSelf: boolean
  dayBreak: boolean
  onReply: (msg: MessageRow) => void
  /** Row is nested under a parent — tighter left column, no self rail. */
  threaded?: boolean
}) {
  const author = preferredName({ agent_id: msg.agent_id, display_name: msg.display_name })
  // Orphan reply: row has a refs[0] but its parent isn't in this page.
  // Surface a dim "↰ in reply to #id" hint so the relationship isn't lost.
  const orphanParent = !threaded && msg.refs && msg.refs[0] ? msg.refs[0] : null
  const dialog = useTraceDialog()

  return (
    <>
      {dayBreak ? <DayDivider iso={msg.timestamp} /> : null}
      <li
        class="animate-etch"
        style={{ animationDelay: `${Math.min(index * 18, 420)}ms` }}
        data-testid={threaded ? 'dispatch-reply' : 'dispatch'}
      >
        <article
          class={`group grid gap-5 py-4 ${
            threaded ? 'md:grid-cols-[88px_1fr]' : 'md:grid-cols-[120px_1fr]'
          } ${isSelf && !threaded ? 'border-l-2 border-l-[var(--color-ember)] pl-4' : 'pl-0'}`}
        >
          {/* Left column: postmark (id + time). Monospaced, hushed. */}
          <div class="flex flex-col gap-1 pt-0.5">
            {msg.id ? (
              <button
                type="button"
                onClick={() => dialog.open(msg.id!)}
                class="text-left font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink2)] transition-colors hover:text-[var(--color-ember)]"
                title="View entry trace"
              >
                #{msg.id}
              </button>
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

          {/* Right column: author + body. */}
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
              {orphanParent ? (
                <button
                  type="button"
                  onClick={() => dialog.open(orphanParent)}
                  class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)] transition-colors hover:text-[var(--color-ember)]"
                  title={`Reply to entry ${orphanParent} not in this page`}
                >
                  ↰ reply to #{orphanParent}
                </button>
              ) : null}
              {msg.id ? (
                <button
                  type="button"
                  onClick={() => onReply(msg)}
                  class="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)] opacity-0 transition hover:text-[var(--color-ember)] group-hover:opacity-100 focus:opacity-100"
                  data-testid="dispatch-reply-button"
                  title="Reply to this message"
                >
                  ↪ Reply
                </button>
              ) : null}
            </header>
            <Markdown
              text={msg.payload.content}
              class="font-display text-[16px] leading-[1.55] text-[var(--color-ink)]"
            />
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

function EmptyState() {
  return (
    <div
      class="mx-auto my-16 max-w-md border-[0.5px] border-dashed border-[var(--color-line)] px-6 py-12 text-center"
      data-testid="messages-empty"
    >
      <p class="font-display text-[18px] italic text-[var(--color-ink3)]">No dispatches yet.</p>
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
