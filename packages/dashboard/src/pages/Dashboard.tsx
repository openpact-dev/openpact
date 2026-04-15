import { useMemo } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { MetricCard } from '../components/MetricCard'
import { ActivityFeed } from '../components/ActivityFeed'
import type { Entry } from '../components/EntryCard'

export function Dashboard() {
  const pact = usePact()
  const sse = useSse()
  // Use the SSE event count as a refetch trigger so anything live-updates.
  const trigger = sse.last?.seq ?? 0

  const status = useQuery(() => pact.status(), { key: 'status', trigger })
  const peers = useQuery(() => pact.peers(), { key: 'peers', trigger })
  const knowledge = useQuery(() => pact.knowledge.list({ limit: 20 }), { key: 'k:20', trigger })
  const tasks = useQuery(() => pact.tasks.list({ limit: 20 }), { key: 't:20', trigger })
  const messages = useQuery(() => pact.messages.list({ limit: 20 }), { key: 'm:20', trigger })

  const feed = useMemo<Entry[]>(() => {
    const merged: Entry[] = []
    for (const e of knowledge.data ?? []) merged.push(e as Entry)
    for (const t of tasks.data ?? []) {
      // Tasks come back as reduced state; project to an entry-shaped object
      // so the feed renders one card per task with the latest status.
      merged.push({
        id: (t as any).id,
        type: 'task',
        timestamp: (t as any).history?.[(t as any).history.length - 1]?.timestamp ?? '',
        agent_id: (t as any).history?.[(t as any).history.length - 1]?.agent_id ?? '',
        payload: { title: (t as any).title, status: (t as any).status },
      })
    }
    for (const m of messages.data ?? []) merged.push(m as Entry)
    return merged
      .filter((e) => e.timestamp)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 20)
  }, [knowledge.data, tasks.data, messages.data])

  const peerCount = peers.data?.length ?? 0
  const onlinePeers = (peers.data ?? []).filter((p: any) => p.online).length

  return (
    <section class="page page-dashboard" data-testid="page-dashboard">
      <h1 class="page-title">Dashboard</h1>

      <div class="metric-grid">
        <MetricCard label="Peers" value={`${onlinePeers} / ${peerCount}`} hint="online / known" />
        <MetricCard label="Knowledge" value={knowledge.data?.length ?? 0} hint="recent entries" />
        <MetricCard label="Tasks" value={tasks.data?.length ?? 0} hint="all states" />
        <MetricCard label="Entries" value={status.data?.entries ?? 0} hint="full pact" />
      </div>

      <h2 class="section-title">Recent activity</h2>
      <ActivityFeed entries={feed} empty="no activity yet — the pact is quiet" />
    </section>
  )
}
