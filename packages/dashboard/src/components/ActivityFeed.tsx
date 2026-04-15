import { EntryCard, type Entry } from './EntryCard'

interface Props {
  entries: Entry[]
  empty?: string
}

export function ActivityFeed({ entries, empty = 'no activity yet' }: Props) {
  if (entries.length === 0) {
    return <p class="empty-state">{empty}</p>
  }
  return (
    <ul class="activity-feed" data-testid="activity-feed">
      {entries.map((e) => (
        <li key={e.id}>
          <EntryCard entry={e} />
        </li>
      ))}
    </ul>
  )
}
