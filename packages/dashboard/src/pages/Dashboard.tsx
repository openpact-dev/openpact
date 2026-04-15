import { useMemo } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { MetricCard } from '../components/MetricCard'
import { Panel } from '../components/Panel'
import { ActivityFeed } from '../components/ActivityFeed'
import { Sigil } from '../components/Sigil'
import { shortHandle } from '../lib/format'
import type { Entry } from '../components/EntryCard'

export function Dashboard() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0

  const status = useQuery(() => pact.status(), { key: `status:${pact.pactId}`, trigger })
  const peers = useQuery(() => pact.peers(), { key: `peers:${pact.pactId}`, trigger })
  const knowledge = useQuery(() => pact.knowledge.list({ limit: 20 }), { key: `k:20:${pact.pactId}`, trigger })
  const tasks = useQuery(() => pact.tasks.list({ limit: 20 }), { key: `t:20:${pact.pactId}`, trigger })
  const messages = useQuery(() => pact.messages.list({ limit: 20 }), { key: `m:20:${pact.pactId}`, trigger })

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
      .slice(0, 5)
  }, [knowledge.data, tasks.data, messages.data])

  const peerCount = peers.data?.length ?? 0
  const onlinePeers = (peers.data ?? []).filter((p: any) => p.online).length
  const knowledgeCount = knowledge.data?.length ?? 0
  const taskCount = tasks.data?.length ?? 0
  const openTasks = (tasks.data ?? []).filter((t: any) => t.status === 'open')
  const entryCount = status.data?.entries ?? 0

  const pactId = status.data?.pact_id ?? null

  return (
    <section data-testid="page-dashboard" class="mx-auto max-w-[1180px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Dashboard
        </h1>
        <div class="flex items-center gap-5 text-right">
          <div class="flex flex-col items-end gap-0.5">
            <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              This peer
            </span>
            <span
              class="font-mono text-[12px] text-[var(--color-ember)]"
              title={status.data?.peer_handle ?? undefined}
            >
              {status.data?.display_name ??
                (status.data?.peer_handle ? shortHandle(status.data.peer_handle) : '…')}
            </span>
          </div>
          {pactId ? (
            <div class="flex flex-col items-end gap-0.5">
              <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
                Pact
              </span>
              <span class="font-mono text-[12px] text-[var(--color-online)]" title={pactId}>
                {status.data?.pact_name ?? `${pactId.slice(0, 8)} · synced`}
              </span>
            </div>
          ) : null}
        </div>
      </header>

      {/* Four equal metrics in one strip — peers carries the ember tone
          to give it a subtle hierarchy without a dedicated hero block. */}
      <div class="mb-6 grid grid-cols-2 gap-0 border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/40 sm:grid-cols-4">
        <div class="border-[var(--color-line)] px-5 py-4 sm:border-r-[0.5px]">
          <MetricCard
            label="Peers"
            value={peerCount}
            hint={peerCount === 0 ? 'None connected' : `${onlinePeers} online`}
            tone="ember"
          />
        </div>
        <div class="border-[var(--color-line)] px-5 py-4 sm:border-r-[0.5px]">
          <MetricCard label="Knowledge" value={knowledgeCount} hint="Entries" tone="knowledge" />
        </div>
        <div class="border-[var(--color-line)] px-5 py-4 sm:border-r-[0.5px]">
          <MetricCard
            label="Tasks"
            value={taskCount}
            hint={`${openTasks.length} open`}
            tone="task"
          />
        </div>
        <div class="px-5 py-4">
          <MetricCard
            label="Total entries"
            value={entryCount}
            hint="In the ledger"
            tone="message"
          />
        </div>
      </div>

      <div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent activity" link={{ label: 'All knowledge', href: '/knowledge' }}>
          <ActivityFeed entries={feed} empty="No activity yet." />
        </Panel>

        <Panel title="Connected peers" link={{ label: 'Network', href: '/network' }}>
          {(peers.data ?? []).length === 0 ? (
            <div class="px-5 py-6 text-[13px] text-[var(--color-ink3)]">
              No peers yet. Share an invite key to connect one.
            </div>
          ) : (
            <div class="divide-y-[0.5px] divide-[var(--color-line)]">
              {(peers.data ?? []).map((p: any) => (
                <PeerRow peer={p} key={p.id ?? p.remote_key} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Open tasks" link={{ label: 'Task board', href: '/tasks' }}>
        {openTasks.length === 0 ? (
          <div class="px-5 py-6 text-[13px] text-[var(--color-ink3)]">No open tasks.</div>
        ) : (
          <div class="divide-y-[0.5px] divide-[var(--color-line)]">
            {openTasks.map((t: any, i: number) => (
              <TaskRow key={t.id} task={t} index={i} />
            ))}
          </div>
        )}
      </Panel>
    </section>
  )
}

function PeerRow({ peer }: { peer: any }) {
  const handle = peer.id || peer.remote_key || '?'
  const short = shortHandle(handle)
  return (
    <div class="flex items-center gap-3 px-5 py-2.5">
      <span
        class={
          peer.online
            ? 'relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-online)]'
            : 'inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-offline)]'
        }
        aria-hidden="true"
      >
        {peer.online ? <span class="absolute inset-0 animate-ember-pulse rounded-full" /> : null}
      </span>
      <div class="min-w-0 flex-1">
        <div class="truncate font-mono text-[12px] text-[var(--color-ember)]">{short}</div>
        <div class="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
          {peer.remote_key ? `${peer.remote_key.slice(0, 14)}…` : 'Local'}
        </div>
      </div>
      <span
        class={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          peer.online ? 'text-[var(--color-online)]' : 'text-[var(--color-ink3)]'
        }`}
      >
        {peer.online ? 'Online' : 'Offline'}
      </span>
    </div>
  )
}

function TaskRow({ task, index }: { task: any; index: number }) {
  return (
    <div
      class="animate-etch flex items-start gap-3 px-5 py-2.5"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <Sigil kind="task" size={14} bordered />
      <div class="min-w-0 flex-1">
        <div class="text-[14px] leading-[1.4] text-[var(--color-ink)]">{task.title}</div>
        <div class="mt-0.5 text-[12px] text-[var(--color-ink3)]">
          {task.claimed_by ? (
            <>
              Claimed by{' '}
              <span class="font-mono text-[var(--color-ember)]">
                {shortHandle(task.claimed_by)}
              </span>
            </>
          ) : (
            'Unclaimed'
          )}
        </div>
      </div>
    </div>
  )
}
