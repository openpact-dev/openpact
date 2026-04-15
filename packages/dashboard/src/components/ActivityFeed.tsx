import { FeedRow, type Entry } from './EntryCard'

interface Props {
  entries: Entry[]
  empty?: string
}

export function ActivityFeed({ entries, empty = 'The pact is quiet.' }: Props) {
  if (entries.length === 0) {
    return (
      <div class="px-5 py-8 text-center font-display italic text-[15px] text-[var(--color-ink3)]">
        {empty}
      </div>
    )
  }
  return (
    <div data-testid="activity-feed" class="divide-y-[0.5px] divide-[var(--color-line)]">
      {entries.map((e, i) => (
        <FeedRow key={e.id} entry={e} index={i} />
      ))}
    </div>
  )
}
