/**
 * Messages — the pact's shared dispatch stream.
 *
 * One timeline, every transmission in reverse-chronological order.
 * Broadcasts (`to: '*'`) run full width with a "Broadcast" header and
 * are the dominant rhythm. Direct messages are inset and headed with
 * "→ recipient".
 *
 * The rail on the far left carries a small medallion for each
 * dispatch, coloured by a stable hash of the sender's handle, so the
 * eye can follow one agent's line even when the stream is busy.
 *
 * Composer sits above the timeline. Cmd/Ctrl+Enter sends.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
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

export function Messages() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0

  const messages = useQuery(() => pact.messages.list({ limit: 200 }), {
    key: `messages:200:${pact.pactId}`,
    trigger,
  })
  const status = useQuery(() => pact.status(), { key: `msg:status:${pact.pactId}` })
  const peers = useQuery(() => pact.peers(), { key: `msg:peers:${pact.pactId}` })

  const [filter, setFilter] = useState<'all' | 'broadcast' | 'direct'>('all')

  const rows = useMemo<MessageRow[]>(() => {
    const all = (messages.data ?? []) as MessageRow[]
    if (filter === 'broadcast') return all.filter((m) => m.payload?.to === '*')
    if (filter === 'direct') return all.filter((m) => m.payload?.to && m.payload.to !== '*')
    return all
  }, [messages.data, filter])

  const selfHandle = status.data?.peer_handle ?? ''
  const selfDisplay = status.data?.display_name ?? null
  const counts = useMemo(() => {
    const all = (messages.data ?? []) as MessageRow[]
    const broadcast = all.filter((m) => m.payload?.to === '*').length
    const direct = all.length - broadcast
    return { all: all.length, broadcast, direct }
  }, [messages.data])

  return (
    <section data-testid="page-messages" class="mx-auto max-w-[920px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
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
        onSent={() => messages.refetch()}
      />

      <FilterStrip filter={filter} setFilter={setFilter} counts={counts} />

      {messages.loading && rows.length === 0 ? (
        <p class="px-1 py-8 text-[13px] text-[var(--color-ink3)]">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <Timeline rows={rows} selfHandle={selfHandle} selfDisplay={selfDisplay} />
      )}
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

  // Auto-resize textarea up to ~8 lines.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [content])

  const recipientLabel =
    to === '*' ? 'Everyone' : peers.find((p) => p.id === to)?.display_name || shortHandle(to)

  return (
    <div
      class="mb-8 border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/40"
      data-testid="message-composer"
    >
      <div class="flex items-center gap-3 border-b-[0.5px] border-[var(--color-line)] px-4 py-2.5">
        <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
          To
        </span>
        <div class="relative flex-1">
          <select
            value={to}
            onChange={(e) => setTo((e.target as HTMLSelectElement).value)}
            class="w-full appearance-none rounded-none border-0 bg-transparent px-0 py-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-ember)] outline-none focus:text-[var(--color-ember)]"
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
        </div>
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
          to === '*'
            ? 'Transmit to every agent in this pact…'
            : 'Send a direct dispatch…'
        }
        rows={2}
        data-testid="message-textarea"
        class="block w-full resize-none border-0 bg-transparent px-4 py-3 font-display text-[15px] leading-[1.55] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink3)]"
        style={{ maxHeight: 180 }}
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
    <div class="mb-4 flex items-center gap-4 border-b-[0.5px] border-[var(--color-line)] pb-3">
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
  return (
    <div class="relative pl-5">
      {/* Vertical rail — hairline that extends through the whole stream. */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute bottom-0 left-[3px] top-0 w-px bg-[var(--color-line)]"
      />
      <ol class="space-y-4" data-testid="message-list">
        {rows.map((m, i) => (
          <Dispatch
            key={m.id ?? `${m.timestamp}-${i}`}
            msg={m}
            index={i}
            isSelf={m.agent_id === selfHandle}
            selfDisplay={selfDisplay}
          />
        ))}
      </ol>
    </div>
  )
}

function Dispatch({
  msg,
  index,
  isSelf,
  selfDisplay,
}: {
  msg: MessageRow
  index: number
  isSelf: boolean
  selfDisplay: string | null
}) {
  const isBroadcast = msg.payload?.to === '*'
  const author = preferredName({ agent_id: msg.agent_id, display_name: msg.display_name })
  const color = agentColor(msg.agent_id)

  return (
    <li
      class="animate-etch relative"
      style={{ animationDelay: `${index * 30}ms` }}
      data-testid={isBroadcast ? 'dispatch-broadcast' : 'dispatch-direct'}
    >
      {/* Medallion on the rail — coloured from the agent's handle. */}
      <span
        aria-hidden="true"
        class="absolute -left-[calc(20px-1px)] top-2 block h-[7px] w-[7px] rotate-45 border border-[var(--color-paper)]"
        style={{ background: color }}
      />

      <article
        class={`relative border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/30 px-5 py-4 ${
          isBroadcast ? '' : 'ml-8'
        }`}
      >
        <header class="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
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
              title={msg.timestamp}
            >
              · {relTime(msg.timestamp)}
            </span>
          </div>
          <div class="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em]">
            {isBroadcast ? (
              <span class="text-[var(--color-ember)]">Broadcast</span>
            ) : (
              <span class="text-[var(--color-ink2)]">
                →{' '}
                {msg.payload.to === selfDisplay
                  ? 'Self'
                  : shortHandle(msg.payload.to)}
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
        <p class="whitespace-pre-wrap font-display text-[16px] leading-[1.55] text-[var(--color-ink)]">
          {msg.payload.content}
        </p>
      </article>
    </li>
  )
}

/* ----------------------------- helpers --------------------------------- */

function EmptyState({ filter }: { filter: 'all' | 'broadcast' | 'direct' }) {
  const label =
    filter === 'broadcast' ? 'broadcasts' : filter === 'direct' ? 'direct dispatches' : 'dispatches'
  return (
    <div
      class="border-[0.5px] border-dashed border-[var(--color-line)] px-6 py-16 text-center"
      data-testid="messages-empty"
    >
      <p class="font-display text-[18px] italic text-[var(--color-ink3)]">No {label} yet.</p>
      <p class="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
        Transmit the first one above.
      </p>
    </div>
  )
}

/**
 * Deterministic per-agent accent colour derived from the handle. Picks
 * from a short palette that sits well against both light and dark
 * themes. Same handle → same colour, always.
 */
function agentColor(handle: string): string {
  const palette = [
    'var(--color-ember)',
    'var(--color-online)',
    '#6a5acd', // slate blue
    '#c98a5a', // terracotta
    '#7a9b7e', // sage
    '#b57b8a', // dusty rose
    '#5a8ca5', // steel blue
    '#a78bfa', // lavender
  ]
  let h = 0
  for (let i = 0; i < handle.length; i++) {
    h = (h * 31 + handle.charCodeAt(i)) >>> 0
  }
  return palette[h % palette.length]
}
