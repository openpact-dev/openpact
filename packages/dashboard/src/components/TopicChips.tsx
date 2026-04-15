interface Props {
  topics: string[]
  selected: string | null
  onSelect: (topic: string | null) => void
}

const BASE =
  'cursor-pointer rounded-full border-[0.5px] border-line bg-paper px-3 py-[5px] text-[12px] font-normal text-ink2 hover:border-line-h hover:text-ink'
const ACTIVE = 'border-purple bg-purple-soft text-purple-deep'

export function TopicChips({ topics, selected, onSelect }: Props) {
  const cls = (active: boolean) => (active ? `${BASE} ${ACTIVE}` : BASE)
  return (
    <div class="mb-[18px] flex flex-wrap gap-1.5" role="group" aria-label="Topic filters">
      <button class={cls(selected === null)} onClick={() => onSelect(null)} data-testid="chip-all">
        all
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
