interface Props {
  topics: string[]
  selected: string | null
  onSelect: (topic: string | null) => void
}

export function TopicChips({ topics, selected, onSelect }: Props) {
  return (
    <div class="topic-chips" role="group" aria-label="Topic filters">
      <button
        class={selected === null ? 'chip chip-active' : 'chip'}
        onClick={() => onSelect(null)}
        data-testid="chip-all"
      >
        all
      </button>
      {topics.map((topic) => (
        <button
          key={topic}
          class={selected === topic ? 'chip chip-active' : 'chip'}
          onClick={() => onSelect(topic)}
          data-testid={`chip-${topic}`}
        >
          {topic}
        </button>
      ))}
    </div>
  )
}
