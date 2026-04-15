import { route } from 'preact-router'
import { Sigil, type SigilKind } from './Sigil'
import { relTime, preferredName } from '../lib/format'

export interface Entry {
  id: string
  type: SigilKind
  timestamp: string
  agent_id: string
  display_name?: string | null
  payload: Record<string, any>
}

// Mid-sentence verbs after a peer handle: "anon-fox-1234 shared a
// note about routing: …". Handle starts the sentence (a literal
// value), so these verb fragments stay lowercase.
const TYPE_VERB: Record<SigilKind, string> = {
  knowledge: 'shared a note',
  task: 'opened a task',
  skill: 'added a skill',
  message: 'sent a message',
}

function summary(entry: Entry): string {
  switch (entry.type) {
    case 'knowledge':
      return entry.payload.content ?? ''
    case 'task':
      return `${entry.payload.title ?? ''}${entry.payload.status ? ` · ${entry.payload.status}` : ''}`
    case 'skill':
      return `${entry.payload.name ?? ''}${entry.payload.version ? ` v${entry.payload.version}` : ''}`
    case 'message':
      return entry.payload.content ?? ''
    default:
      return ''
  }
}

/**
 * Ledger row — used in the activity feed.
 *
 * Layout: a left margin with the relative timestamp in mono, a
 * hairline rule with a tiny medallion, then the type sigil and the
 * prose. Reads top-to-bottom like a logbook page.
 */
export function FeedRow({ entry, index = 0 }: { entry: Entry; index?: number }) {
  return (
    <button
      type="button"
      onClick={() => route(`/trace/${entry.id}`)}
      class="group animate-etch grid w-full grid-cols-[78px_1px_1fr] items-stretch gap-0 px-5 py-2.5 text-left transition-colors hover:bg-[var(--color-mist)]/40"
      style={{ animationDelay: `${index * 35}ms` }}
      data-testid="entry-card"
    >
      <div class="flex items-baseline justify-end pr-4">
        <time class="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink3)]">
          {relTime(entry.timestamp)}
        </time>
      </div>
      <div class="ledger-rule" />
      <div class="flex items-start gap-3 pl-5">
        <Sigil kind={entry.type} size={14} bordered />
        <div class="min-w-0 flex-1 pt-px">
          <div class="text-[13px] leading-[1.5] text-[var(--color-ink2)]">
            <span
              class="font-mono text-[11px] uppercase tracking-wider text-[var(--color-ember)]"
              title={entry.agent_id}
            >
              {preferredName(entry)}
            </span>{' '}
            {TYPE_VERB[entry.type]}
            {entry.type === 'knowledge' && entry.payload.topic ? (
              <>
                {' '}
                about <span class="text-[var(--color-ink)]">{entry.payload.topic}</span>
              </>
            ) : null}
            {'.'}
          </div>
          <div class="mt-0.5 line-clamp-2 text-[14px] leading-[1.5] text-[var(--color-ink)]">
            {summary(entry)}
          </div>
        </div>
      </div>
    </button>
  )
}

/**
 * Knowledge-browser card — taller variant. Used in a 2-up grid on
 * the Knowledge page; designed to read like an entry in a ledger
 * with topic eyebrow + body + provenance line.
 */
export function EntryCard({ entry, index = 0 }: { entry: Entry; index?: number }) {
  return (
    <button
      type="button"
      onClick={() => route(`/trace/${entry.id}`)}
      class="group animate-etch relative flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--color-mist)]/30"
      style={{ animationDelay: `${index * 30}ms` }}
      data-testid="entry-card"
    >
      <span
        aria-hidden="true"
        class="absolute left-0 top-4 h-[calc(100%-32px)] w-px bg-[var(--color-line)] transition-colors group-hover:bg-[var(--color-ember)]"
      />
      <Sigil kind={entry.type} size={14} bordered />
      <div class="min-w-0 flex-1">
        {entry.type === 'knowledge' && entry.payload.topic ? (
          <div class="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-ember)]">
            {entry.payload.topic}
          </div>
        ) : null}
        <p class="mt-1.5 text-[14px] leading-[1.5] text-[var(--color-ink)]">{summary(entry)}</p>
        <div class="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink3)]">
          <span class="text-[var(--color-ember)]" title={entry.agent_id}>
            {preferredName(entry)}
          </span>
          <span class="opacity-50">·</span>
          <time>{relTime(entry.timestamp)}</time>
          <span class="opacity-50">·</span>
          <span class="opacity-70">{entry.id}</span>
        </div>
      </div>
    </button>
  )
}
