import { FeedRow, type Entry } from './EntryCard'

interface Props {
  entries: Entry[]
  empty?: string
}

export function ActivityFeed({ entries, empty = 'No activity yet.' }: Props) {
  if (entries.length === 0) {
    return <div class="px-[18px] py-6 text-[13px] italic text-ink3">{empty}</div>
  }
  return (
    <div data-testid="activity-feed">
      {entries.map((e) => (
        <FeedRow key={e.id} entry={e} />
      ))}
    </div>
  )
}
