interface Props {
  topics: string[]
  selected: string | null
  onSelect: (topic: string | null) => void
}

const BASE =
  'cursor-pointer rounded-full border-[0.5px] border-[var(--color-line)] bg-transparent px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)] transition-colors hover:border-[var(--color-line-h)] hover:text-[var(--color-ink)]'
const ACTIVE = 'border-[var(--color-ember)] bg-[var(--color-ember-soft)] text-[var(--color-ember)]'

export function TopicChips({ topics, selected, onSelect }: Props) {
  const cls = (active: boolean) => (active ? `${BASE} ${ACTIVE}` : BASE)
  return (
    <div class="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Topic filters">
      <button class={cls(selected === null)} onClick={() => onSelect(null)} data-testid="chip-all">
        All
      </button>
      {topics.map((topic) => (
        <button
          key={topic}
          class={cls(selected === topic)}
          onClick={() => onSelect(topic)}
          data-testid={`chip-${topic}`}
        >
          {topic}
        </button>
      ))}
    </div>
  )
}
