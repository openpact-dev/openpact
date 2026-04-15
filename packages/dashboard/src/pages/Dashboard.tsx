import { useMemo } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { MetricCard } from '../components/MetricCard'
import { Panel } from '../components/Panel'
import { ActivityFeed } from '../components/ActivityFeed'
import { shortHandle } from '../lib/format'
import type { Entry } from '../components/EntryCard'

export function Dashboard() {
  const pact = usePact()
  const sse = useSse()
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
      const last = (t as any).history?.[(t as any).history.length - 1]
      merged.push({
        id: (t as any).id,
        type: 'task',
        timestamp: last?.timestamp ?? '',
        agent_id: last?.agent_id ?? '',
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
  const knowledgeCount = knowledge.data?.length ?? 0
  const taskCount = tasks.data?.length ?? 0
  const openTasks = (tasks.data ?? []).filter((t: any) => t.status === 'open')

  const pactId = status.data?.pact_id ?? null

  return (
    <section data-testid="page-dashboard">
      <header class="mb-[22px] flex items-baseline justify-between">
        <h1 class="text-xl font-semibold tracking-[-0.4px] text-ink">Dashboard</h1>
        <span class="text-[12px] text-ink3">
          {status.data?.peer_handle ? shortHandle(status.data.peer_handle) : ''}
          {pactId ? <span class="text-ink3"> · Synced</span> : null}
        </span>
      </header>

      <div class="mb-[22px] grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Peers"
          value={peerCount}
          hint={`${onlinePeers} online now`}
          tone="text-purple"
        />
        <MetricCard
          label="Knowledge"
          value={knowledgeCount}
          hint="Recent entries"
          tone="text-teal"
        />
        <MetricCard
          label="Tasks"
          value={taskCount}
          hint={`${openTasks.length} open`}
          tone="text-amber"
        />
        <MetricCard
          label="Entries"
          value={status.data?.entries ?? 0}
          hint="Full pact"
          tone="text-coral"
        />
      </div>

      <div class="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Recent activity" link={{ label: 'View all', href: '/knowledge' }}>
          <ActivityFeed entries={feed} empty="No activity yet. The pact is quiet." />
        </Panel>

        <Panel title="Connected peers" link={{ label: 'Manage', href: '/network' }}>
          {(peers.data ?? []).length === 0 ? (
            <div class="px-[18px] py-6 text-[13px] italic text-ink3">No peers connected.</div>
          ) : (
            (peers.data ?? []).map((p: any) => <PeerRow peer={p} key={p.id ?? p.remote_key} />)
          )}
        </Panel>
      </div>

      <Panel title="Open tasks" link={{ label: 'View task board', href: '/tasks' }}>
        {openTasks.length === 0 ? (
          <div class="px-[18px] py-6 text-[13px] italic text-ink3">No open tasks.</div>
        ) : (
          openTasks.map((t: any) => <TaskRow key={t.id} task={t} />)
        )}
      </Panel>
    </section>
  )
}

function PeerRow({ peer }: { peer: any }) {
  const initials = (peer.id || peer.remote_key || '?').slice(5, 7).toUpperCase()
  return (
    <div class="flex items-center gap-2.5 border-b-[0.5px] border-line px-[18px] py-2.5 last:border-b-0">
      <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-soft text-[10px] font-medium text-purple-deep">
        {initials}
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-medium text-ink">{peer.id}</div>
        <div class="text-[11px] text-ink3">Remote {peer.remote_key?.slice(0, 12)}…</div>
      </div>
      <span
        class={
          peer.online
            ? 'rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-medium text-teal'
            : 'rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-ink3'
        }
      >
        {peer.online ? 'Online' : 'Offline'}
      </span>
    </div>
  )
}

const TASK_BADGE: Record<string, { label: string; cls: string }> = {
  open: {
    label: 'Open',
    cls: 'rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-medium text-teal',
  },
  claimed: {
    label: 'Claimed',
    cls: 'rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-medium text-amber',
  },
  complete: {
    label: 'Complete',
    cls: 'rounded-full bg-purple-soft px-2 py-0.5 text-[10px] font-medium text-purple-deep',
  },
}

function TaskRow({ task }: { task: any }) {
  const badge = TASK_BADGE[task.status as string] ?? {
    label: task.status,
    cls: 'rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-ink3',
  }
  return (
    <div class="border-b-[0.5px] border-line px-[18px] py-[11px] last:border-b-0">
      <div class="text-[13px] font-medium text-ink">{task.title}</div>
      <div class="mt-1 flex items-center gap-2">
        <span class={badge.cls}>{badge.label}</span>
        <span class="text-[11px] text-ink3">
          {task.claimed_by ? `Claimed by ${shortHandle(task.claimed_by)}` : 'Unclaimed'}
        </span>
      </div>
    </div>
  )
}
