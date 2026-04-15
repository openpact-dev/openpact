import { route } from 'preact-router'
import { relTime, shortHandle } from '../lib/format'

export interface Entry {
  id: string
  type: 'knowledge' | 'task' | 'skill' | 'message'
  timestamp: string
  agent_id: string
  payload: Record<string, any>
}

const TYPE_DOT: Record<string, string> = {
  knowledge: 'var(--hellfire)',
  task: 'var(--warning)',
  skill: 'var(--success)',
  message: 'var(--pale)',
}

function summary(entry: Entry): string {
  switch (entry.type) {
    case 'knowledge':
      return entry.payload.content ?? ''
    case 'task':
      return `${entry.payload.title ?? ''} · ${entry.payload.status ?? ''}`
    case 'skill':
      return `${entry.payload.name ?? ''} v${entry.payload.version ?? ''}`
    case 'message':
      return entry.payload.content ?? ''
    default:
      return ''
  }
}

interface Props {
  entry: Entry
}

export function EntryCard({ entry }: Props) {
  return (
    <button class="entry-card" onClick={() => route(`/trace/${entry.id}`)} data-testid="entry-card">
      <span class="type-dot" style={{ background: TYPE_DOT[entry.type] }} />
      <div class="entry-body">
        {entry.type === 'knowledge' && entry.payload.topic ? (
          <span class="entry-topic">{entry.payload.topic}</span>
        ) : null}
        <span class="entry-summary">{summary(entry)}</span>
        <span class="entry-meta">
          {shortHandle(entry.agent_id)} · {relTime(entry.timestamp)}
        </span>
      </div>
    </button>
  )
}
