import { useEffect, useMemo, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { TopicChips } from '../components/TopicChips'
import { EntryCard, type Entry } from '../components/EntryCard'
import { PactlessState } from '../components/PactlessState'

const RECENCY_OPTIONS = [
  { value: 'all', label: 'All time', ms: Number.POSITIVE_INFINITY },
  { value: 'today', label: 'Today', ms: 24 * 3600 * 1000 },
  { value: 'week', label: 'This week', ms: 7 * 24 * 3600 * 1000 },
  { value: 'month', label: 'This month', ms: 30 * 24 * 3600 * 1000 },
] as const

const INPUT =
  'w-full rounded-none border-0 border-b-[0.5px] border-[var(--color-line)] bg-transparent px-1 py-2 text-[14px] text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink3)] focus:border-[var(--color-ember)]'

const SELECT =
  'rounded-none border-0 border-b-[0.5px] border-[var(--color-line)] bg-transparent py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink)] outline-none focus:border-[var(--color-ember)]'

export function Knowledge() {
  const pact = usePact()
  if (!pact.pactId) {
    return (
      <PactlessState
        page="Knowledge"
        action="Knowledge entries live inside a pact. Create or join one to start capturing and sharing them."
      />
    )
  }
  return <KnowledgePage />
}

/**
 * Inner component bound to a real pact. Split from the default export
 * so hook order stays stable — the pactless early-return only runs a
 * single hook (usePact), then mounts this when a pact is available.
 */
function KnowledgePage() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.event === 'entry-applied' ? sse.last.seq : 0

  const knowledge = useQuery(() => pact.knowledge.list({ limit: 200 }), {
    key: `knowledge:200:${pact.pactId}`,
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
    for (const e of knowledge.data?.entries ?? []) {
      const t = (e as any).payload?.topic
      if (typeof t === 'string' && t) set.add(t)
    }
    return [...set].sort()
  }, [knowledge.data])

  const filtered = useMemo(() => {
    const recencyMs = RECENCY_OPTIONS.find((o) => o.value === recency)!.ms
    const cutoff = recencyMs === Number.POSITIVE_INFINITY ? 0 : Date.now() - recencyMs
    return (knowledge.data?.entries ?? []).filter((e: any) => {
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
    <section data-testid="page-knowledge" class="mx-auto max-w-[1180px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Knowledge
        </h1>
        <span class="font-mono text-[12px] text-[var(--color-ink3)]">
          <span class="text-[var(--color-ember)]">{filtered.length}</span>
          {' / '}
          {knowledge.data?.entries.length ?? 0} entries
        </span>
      </header>

      <div class="mb-5">
        <input
          type="search"
          placeholder="Search content…"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          data-testid="knowledge-search"
          class={INPUT}
        />
      </div>

      <div class="mb-5 flex flex-wrap items-end gap-6">
        <label class="inline-flex flex-col gap-1.5">
          <span class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
            Confidence ≥ <span class="text-[var(--color-ember)]">{confidence.toFixed(1)}</span>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={confidence}
            onInput={(e) => setConfidence(Number((e.target as HTMLInputElement).value))}
            class="w-48 accent-[var(--color-ember)]"
            data-testid="knowledge-confidence"
          />
        </label>
        <label class="inline-flex flex-col gap-1.5">
          <span class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
            Recency
          </span>
          <select
            value={recency}
            onChange={(e) => setRecency((e.target as HTMLSelectElement).value as any)}
            data-testid="knowledge-recency"
            class={SELECT}
          >
            {RECENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <TopicChips topics={topics} selected={selectedTopic} onSelect={setSelectedTopic} />

      {knowledge.loading ? (
        <p class="px-1 py-6 text-[13px] text-[var(--color-ink3)]">Loading…</p>
      ) : filtered.length === 0 ? (
        <p
          class="px-1 py-8 text-center text-[13px] text-[var(--color-ink3)]"
          data-testid="knowledge-empty"
        >
          No entries match.
        </p>
      ) : (
        <div
          class="grid grid-cols-1 gap-0 divide-y-[0.5px] divide-[var(--color-line)] border-y-[0.5px] border-[var(--color-line)] md:grid-cols-2 md:divide-y-0 md:[&>*:nth-child(odd)]:border-r-[0.5px] md:[&>*:nth-child(odd)]:border-[var(--color-line)] md:[&>*:nth-child(n+3)]:border-t-[0.5px] md:[&>*:nth-child(n+3)]:border-[var(--color-line)]"
          data-testid="entry-list"
        >
          {filtered.map((e, i) => (
            <EntryCard key={e.id} entry={e} index={i} />
          ))}
        </div>
      )}
    </section>
  )
}
