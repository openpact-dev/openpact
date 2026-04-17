import { useMemo, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSharedSse } from '../hooks/useSse'
import { useAgentNames } from '../hooks/useAgentNames'
import { MetricCard } from '../components/MetricCard'
import { Panel } from '../components/Panel'
import { ActivityFeed } from '../components/ActivityFeed'
import { Sigil } from '../components/Sigil'
import { InviteDialog } from '../components/InviteDialog'
import { PactlessState } from '../components/PactlessState'
import { eventSeqForPact } from '../lib/events'
import { shortHandle } from '../lib/format'
import type { Entry } from '../components/EntryCard'

export function Dashboard() {
  const pact = usePact()
  if (!pact.pactId) {
    return <PactlessState page="Dashboard" />
  }
  return <DashboardPage />
}

function DashboardPage() {
  const pact = usePact()
  const sse = useSharedSse()
  const { nameFor } = useAgentNames()
  const trigger = eventSeqForPact(sse.last, pact.pactId, [
    'entry-applied',
    'member-online',
    'member-offline',
    'update',
  ])

  const status = useQuery(() => pact.status(), { key: `status:${pact.pactId}`, trigger })
  const agents = useQuery(() => pact.agents(), { key: `agents:${pact.pactId}`, trigger })
  const knowledge = useQuery(() => pact.knowledge.list({ limit: 20 }), {
    key: `k:20:${pact.pactId}`,
    trigger,
  })
  const tasks = useQuery(() => pact.tasks.list({ limit: 20 }), {
    key: `t:20:${pact.pactId}`,
    trigger,
  })
  const messages = useQuery(() => pact.messages.list({ limit: 20 }), {
    key: `m:20:${pact.pactId}`,
    trigger,
  })

  const knowledgeEntries = knowledge.data?.entries ?? []
  const taskEntries = tasks.data?.entries ?? []
  const messageEntries = messages.data?.entries ?? []

  const feed = useMemo<Entry[]>(() => {
    // Each list is already newest-first from the API. A one-pass merge
    // keeps the sort stable — no full re-sort needed for the top-5.
    const merged: Entry[] = []
    for (const e of knowledgeEntries) merged.push(e as Entry)
    for (const t of taskEntries) {
      const last = (t as any).history?.[(t as any).history.length - 1]
      // History entries carry the author's display_name from write time
      // (apply.ts stores it). Fall through to the live roster lookup so
      // a renamed peer still displays correctly on the Dashboard feed.
      const authorHandle = (last?.agent_id as string | undefined) ?? ''
      const displayName =
        (last?.display_name as string | null | undefined) ?? nameFor(authorHandle) ?? null
      merged.push({
        id: (t as any).id,
        type: 'task',
        timestamp: last?.timestamp ?? '',
        agent_id: authorHandle,
        display_name: displayName || null,
        payload: { title: (t as any).title, status: (t as any).status },
      })
    }
    for (const m of messageEntries) merged.push(m as Entry)
    return merged
      .filter((e) => e.timestamp)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 5)
  }, [knowledgeEntries, taskEntries, messageEntries, nameFor])

  const agentCount = agents.data?.length ?? 0
  const onlineAgentList = (agents.data ?? []).filter((a: any) => a.online)
  const onlineAgents = onlineAgentList.length
  const knowledgeCount = knowledgeEntries.length
  const taskCount = taskEntries.length
  const messageCount = messageEntries.length
  const openTasks = taskEntries.filter((t: any) => t.status === 'open')
  const isCreator = status.data?.role === 'creator'

  const [showInvite, setShowInvite] = useState(false)

  return (
    <section data-testid="page-dashboard" class="mx-auto max-w-[1180px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Dashboard
        </h1>
        <div class="flex items-center gap-4">
          {isCreator ? (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              data-testid="dashboard-invite"
              class="border-[0.5px] border-[var(--color-ember)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] hover:bg-[var(--color-ember)]/10"
            >
              Share invite
            </button>
          ) : null}
        </div>
      </header>

      {/* Four equal metrics in one strip — agents carries the ember tone
          to give it a subtle hierarchy without a dedicated hero block. */}
      <div class="mb-6 grid grid-cols-2 gap-0 border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/40 sm:grid-cols-4">
        <div class="border-[var(--color-line)] px-5 py-4 sm:border-r-[0.5px]">
          <MetricCard
            label="Agents"
            value={agentCount}
            hint={agentCount === 0 ? 'None connected' : `${onlineAgents} online`}
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
            label="Messages"
            value={messageCount}
            hint={messageCount === 0 ? 'None yet' : 'Dispatched'}
            tone="message"
          />
        </div>
      </div>

      <div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent activity" link={{ label: 'All knowledge', href: '/knowledge' }}>
          <ActivityFeed entries={feed} empty="No activity yet." />
        </Panel>

        <Panel title="Connected agents" link={{ label: 'Network', href: '/network' }}>
          {onlineAgentList.length === 0 ? (
            <div class="px-5 py-6 text-[13px] text-[var(--color-ink3)]">
              {agentCount === 0
                ? 'No agents yet. Share an invite to connect one.'
                : 'No agents online right now.'}
            </div>
          ) : (
            <div class="divide-y-[0.5px] divide-[var(--color-line)]">
              {onlineAgentList.map((a: any) => (
                <AgentRow agent={a} key={a.id ?? a.remote_key} />
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
              <TaskRow key={t.id} task={t} index={i} nameFor={nameFor} />
            ))}
          </div>
        )}
      </Panel>

      {showInvite ? <InviteDialog onClose={() => setShowInvite(false)} /> : null}
    </section>
  )
}

function AgentRow({ agent }: { agent: any }) {
  const handle = agent.id || agent.remote_key || '?'
  const short = shortHandle(handle)
  const name = (typeof agent.display_name === 'string' && agent.display_name) || short
  return (
    <div class="flex items-center gap-3 px-5 py-2.5">
      <span
        class={
          agent.online
            ? 'relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-online)]'
            : 'inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-offline)]'
        }
        aria-hidden="true"
      >
        {agent.online ? <span class="absolute inset-0 animate-ember-pulse rounded-full" /> : null}
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-[13px] text-[var(--color-ink)]">{name}</span>
          {agent.is_self ? (
            <span class="shrink-0 border-[0.5px] border-[var(--color-ember)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ember)]">
              Self
            </span>
          ) : null}
        </div>
        <div class="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
          {short}
        </div>
      </div>
      <span
        class={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          agent.online ? 'text-[var(--color-online)]' : 'text-[var(--color-ink3)]'
        }`}
      >
        {agent.online ? 'Online' : 'Offline'}
      </span>
    </div>
  )
}

function TaskRow({
  task,
  index,
  nameFor,
}: {
  task: any
  index: number
  nameFor: (handle: string | null | undefined) => string
}) {
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
              <span class="font-mono text-[var(--color-ember)]" title={task.claimed_by}>
                {nameFor(task.claimed_by)}
              </span>
            </>
          ) : task.assigned_to ? (
            <>
              Reserved for{' '}
              <span class="font-mono text-[var(--color-ink2)]" title={task.assigned_to}>
                {nameFor(task.assigned_to)}
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
