import { useEffect, useMemo, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { TopicChips } from '../components/TopicChips'
import { EntryCard, type Entry } from '../components/EntryCard'

const RECENCY_OPTIONS = [
  { value: 'all', label: 'All time', ms: Number.POSITIVE_INFINITY },
  { value: 'today', label: 'Today', ms: 24 * 3600 * 1000 },
  { value: 'week', label: 'This week', ms: 7 * 24 * 3600 * 1000 },
  { value: 'month', label: 'This month', ms: 30 * 24 * 3600 * 1000 },
] as const

const INPUT_BASE =
  'rounded-md border-[0.5px] border-line bg-paper px-3.5 py-[9px] text-[13px] text-ink outline-none focus:border-purple'

export function Knowledge() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.event === 'entry-applied' ? sse.last.seq : 0

  const knowledge = useQuery(() => pact.knowledge.list({ limit: 200 }), {
    key: 'knowledge:200',
    trigger,
  })

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
    const recencyMs = RECENCY_OPTIONS.find((o) => o.value === recency)!.ms
    const cutoff = recencyMs === Number.POSITIVE_INFINITY ? 0 : Date.now() - recencyMs
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
    <section data-testid="page-knowledge">
      <header class="mb-5 flex items-baseline justify-between">
        <h1 class="text-xl font-semibold tracking-[-0.4px] text-ink">Knowledge</h1>
        <span class="text-[12px] text-ink3">
          {filtered.length} of {knowledge.data?.length ?? 0} entries.
        </span>
      </header>

      <input
        type="search"
        placeholder="Search content…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        data-testid="knowledge-search"
        class={`${INPUT_BASE} mb-3.5 w-full placeholder:text-ink3`}
      />

      <div class="mb-[18px] flex flex-wrap items-center gap-3">
        <label class="inline-flex items-center gap-2 text-[12px] text-ink2">
          Confidence ≥ <span class="font-medium text-ink">{confidence.toFixed(1)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={confidence}
            onInput={(e) => setConfidence(Number((e.target as HTMLInputElement).value))}
            class="accent-purple"
            data-testid="knowledge-confidence"
          />
        </label>
        <select
          value={recency}
          onChange={(e) => setRecency((e.target as HTMLSelectElement).value as any)}
          data-testid="knowledge-recency"
          class={INPUT_BASE}
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
        <p class="px-1 py-4 text-[13px] italic text-ink3">Loading…</p>
      ) : filtered.length === 0 ? (
        <p class="px-1 py-4 text-[13px] italic text-ink3" data-testid="knowledge-empty">
          No entries match.
        </p>
      ) : (
        <div class="grid grid-cols-1 gap-2.5" data-testid="entry-list">
          {filtered.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
    </section>
  )
}
