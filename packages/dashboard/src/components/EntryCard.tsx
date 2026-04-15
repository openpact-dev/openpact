import { route } from 'preact-router'
import { relTime, shortHandle } from '../lib/format'

export interface Entry {
  id: string
  type: 'knowledge' | 'task' | 'skill' | 'message'
  timestamp: string
  agent_id: string
  payload: Record<string, any>
}

const TYPE_DOT: Record<Entry['type'], string> = {
  knowledge: 'bg-teal',
  task: 'bg-amber',
  skill: 'bg-purple',
  message: 'bg-coral',
}

const TYPE_VERB: Record<Entry['type'], string> = {
  knowledge: 'shared knowledge',
  task: 'updated task',
  skill: 'published skill',
  message: 'broadcast',
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
 * Activity-feed row matching docs/mockups/01-dashboard.html .feed-item.
 * Click navigates to the entry's trace page.
 */
export function FeedRow({ entry }: { entry: Entry }) {
  return (
    <button
      type="button"
      onClick={() => route(`/trace/${entry.id}`)}
      class="flex w-full items-start gap-2.5 border-b-[0.5px] border-line bg-paper px-[18px] py-[11px] text-left last:border-b-0 hover:bg-canvas"
      data-testid="entry-card"
    >
      <span
        class={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[entry.type]}`}
      />
      <div class="min-w-0 flex-1">
        <div class="text-[13px] leading-[1.5] text-ink">
          <strong class="font-medium">{shortHandle(entry.agent_id)}</strong> {TYPE_VERB[entry.type]}
          {entry.type === 'knowledge' && entry.payload.topic ? (
            <span class="text-ink2"> about {entry.payload.topic}: </span>
          ) : (
            <span class="text-ink2">: </span>
          )}
          <span class="text-ink2">{summary(entry)}</span>
        </div>
        <div class="mt-0.5 text-[11px] text-ink3">{relTime(entry.timestamp)}</div>
      </div>
    </button>
  )
}

/** Knowledge-browser card variant — bigger, with topic eyebrow. */
export function EntryCard({ entry }: { entry: Entry }) {
  return (
    <button
      type="button"
      onClick={() => route(`/trace/${entry.id}`)}
      class="flex w-full items-start gap-3 rounded-[12px] border-[0.5px] border-line bg-paper px-[18px] py-4 text-left transition-colors hover:border-line-h"
      data-testid="entry-card"
    >
      <span
        class={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[entry.type]}`}
      />
      <div class="min-w-0 flex-1">
        {entry.type === 'knowledge' && entry.payload.topic ? (
          <div class="text-[10px] font-medium uppercase tracking-[0.06em] text-ink3">
            {entry.payload.topic}
          </div>
        ) : null}
        <div class="mt-0.5 text-[13px] leading-[1.5] text-ink">{summary(entry)}</div>
        <div class="mt-1 text-[11px] text-ink3">
          {shortHandle(entry.agent_id)} · {relTime(entry.timestamp)}
        </div>
      </div>
    </button>
  )
}
