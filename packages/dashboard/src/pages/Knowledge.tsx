import { useEffect, useMemo, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { TopicChips } from '../components/TopicChips'
import { EntryCard, type Entry } from '../components/EntryCard'

const RECENCY_OPTIONS = [
  { value: 'all', label: 'all time', ms: Number.POSITIVE_INFINITY },
  { value: 'today', label: 'today', ms: 24 * 3600 * 1000 },
  { value: 'week', label: 'this week', ms: 7 * 24 * 3600 * 1000 },
  { value: 'month', label: 'this month', ms: 30 * 24 * 3600 * 1000 },
] as const

export function Knowledge() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.event === 'entry-applied' ? sse.last.seq : 0

  const knowledge = useQuery(() => pact.knowledge.list({ limit: 200 }), {
    key: 'knowledge:200',
    trigger,
  })

  // Search input — debounced 300ms.
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.toLowerCase()), 300)
    return () => clearTimeout(id)
  }, [query])

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [recency, setRecency] = useState<(typeof RECENCY_OPTIONS)[number]['value']>('all')

  const topics = useMemo(() => {
    const set = new Set<string>()
    for (const e of knowledge.data ?? []) {
      const t = (e as any).payload?.topic
      if (typeof t === 'string' && t) set.add(t)
    }
    return [...set].sort()
  }, [knowledge.data])

  const filtered = useMemo(() => {
    const cutoff =
      RECENCY_OPTIONS.find((o) => o.value === recency)!.ms === Number.POSITIVE_INFINITY
        ? 0
        : Date.now() - RECENCY_OPTIONS.find((o) => o.value === recency)!.ms
    return (knowledge.data ?? []).filter((e: any) => {
      if (selectedTopic && e.payload?.topic !== selectedTopic) return false
      if (typeof e.payload?.confidence === 'number' && e.payload.confidence < confidence)
        return false
      if (cutoff && Date.parse(e.timestamp) < cutoff) return false
      if (
        debounced &&
        !String(e.payload?.content ?? '')
          .toLowerCase()
          .includes(debounced)
      )
        return false
      return true
    }) as Entry[]
  }, [knowledge.data, selectedTopic, confidence, recency, debounced])

  return (
    <section class="page page-knowledge" data-testid="page-knowledge">
      <h1 class="page-title">Knowledge</h1>

      <div class="filters">
        <input
          type="search"
          placeholder="search content…"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          data-testid="knowledge-search"
        />
        <label class="confidence-filter">
          confidence ≥ {confidence.toFixed(1)}
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={confidence}
            onInput={(e) => setConfidence(Number((e.target as HTMLInputElement).value))}
            data-testid="knowledge-confidence"
          />
        </label>
        <select
          value={recency}
          onChange={(e) => setRecency((e.target as HTMLSelectElement).value as any)}
          data-testid="knowledge-recency"
        >
          {RECENCY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <TopicChips topics={topics} selected={selectedTopic} onSelect={setSelectedTopic} />

      {knowledge.loading ? (
        <p class="empty-state">loading…</p>
      ) : filtered.length === 0 ? (
        <p class="empty-state" data-testid="knowledge-empty">
          no entries match
        </p>
      ) : (
        <ul class="entry-list" data-testid="entry-list">
          {filtered.map((e) => (
            <li key={e.id}>
              <EntryCard entry={e} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
