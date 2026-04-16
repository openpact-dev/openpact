import { useMemo } from 'preact/hooks'
import { route } from 'preact-router'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { Sigil } from '../components/Sigil'
import { PactlessState } from '../components/PactlessState'
import { shortHandle } from '../lib/format'

type TaskStatus = 'open' | 'claimed' | 'complete'

interface TaskRow {
  id: string
  title: string
  status: TaskStatus
  claimed_by?: string | null
  claimed_at?: string | null
  result?: string | null
  history: Array<{ timestamp: string; agent_id: string; payload: any }>
}

const COLUMNS: Array<{ key: TaskStatus; label: string; accent: string }> = [
  { key: 'open', label: 'Open', accent: 'var(--color-sigil-task)' },
  { key: 'claimed', label: 'Claimed', accent: 'var(--color-ember)' },
  { key: 'complete', label: 'Complete', accent: 'var(--color-online)' },
]

export function Tasks() {
  const pact = usePact()
  if (!pact.pactId) {
    return (
      <PactlessState
        page="Tasks"
        action="The task board needs a pact. Create one or join an existing pact first."
      />
    )
  }
  return <TasksPage />
}

function TasksPage() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0

  const tasks = useQuery(() => pact.tasks.list({ limit: 500 }), {
    key: `tasks:all:${pact.pactId}`,
    trigger,
  })

  const grouped = useMemo(() => {
    // API returns tasks newest-first already. Bucket by status without
    // re-sorting — the order inside each column is the stream order.
    const by: Record<TaskStatus, TaskRow[]> = { open: [], claimed: [], complete: [] }
    for (const t of (tasks.data?.entries ?? []) as TaskRow[]) {
      if (by[t.status]) by[t.status].push(t)
    }
    return by
  }, [tasks.data])

  return (
    <section data-testid="page-tasks" class="mx-auto max-w-[1180px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Tasks
        </h1>
        <span class="font-mono text-[12px] text-[var(--color-ink3)]">
          {tasks.data?.entries.length ?? 0} total
        </span>
      </header>

      {tasks.loading ? (
        <p class="px-1 py-6 text-[13px] text-[var(--color-ink3)]">Loading…</p>
      ) : (
        <div class="grid grid-cols-1 gap-5 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.key} class="flex flex-col">
              <div
                class="flex items-center justify-between border-b-[0.5px] border-[var(--color-line)] pb-2"
                style={{ borderBottomColor: col.accent, borderBottomWidth: '1px' }}
              >
                <span class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
                  {col.label}
                </span>
                <span
                  class="font-display tabular text-[18px] font-light leading-none"
                  style={{ color: col.accent }}
                >
                  {grouped[col.key].length}
                </span>
              </div>
              <div class="mt-3 flex flex-col gap-2" data-testid={`col-${col.key}`}>
                {grouped[col.key].length === 0 ? (
                  <div class="px-2 py-4 text-[13px] text-[var(--color-ink3)]">None.</div>
                ) : (
                  grouped[col.key].map((t, i) => <TaskCard key={t.id} task={t} index={i} />)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function TaskCard({ task, index }: { task: TaskRow; index: number }) {
  const lastEvent = task.history[task.history.length - 1]
  return (
    <button
      type="button"
      onClick={() => route(`/trace/${task.id}`)}
      class="group animate-etch block border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/40 p-3 text-left transition-colors hover:border-[var(--color-ember)]/50 hover:bg-[var(--color-mist)]/30"
      style={{ animationDelay: `${index * 25}ms` }}
      data-testid="task-card"
    >
      <div class="flex items-start gap-2.5">
        <Sigil kind="task" size={14} bordered />
        <div class="min-w-0 flex-1">
          <div class="text-[14px] leading-[1.4] text-[var(--color-ink)]">{task.title}</div>
          <div class="mt-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink3)]">
            {task.claimed_by ? (
              <span class="text-[var(--color-ember)]">{shortHandle(task.claimed_by)}</span>
            ) : (
              <span>Unclaimed</span>
            )}
            {lastEvent ? (
              <>
                <span class="opacity-50">·</span>
                <span class="opacity-70">{task.id}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  )
}
