import { route } from 'preact-router'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { Sigil, type SigilKind } from '../components/Sigil'
import { relTime, preferredName } from '../lib/format'

export function Trace({ id }: { id?: string }) {
  const pact = usePact()
  const entry = useQuery(() => pact.entries.get(id ?? ''), { key: `trace:${pact.pactId}:${id}` })
  const refs = useQuery(() => pact.entries.referencedBy(id ?? ''), {
    key: `refs:${pact.pactId}:${id}`,
  })

  if (!id) {
    return (
      <section class="mx-auto max-w-[720px] pt-12 text-center">
        <p class="text-[14px] text-[var(--color-ink2)]">No entry ID given.</p>
      </section>
    )
  }

  if (entry.loading) {
    return (
      <section class="mx-auto max-w-[920px]">
        <p class="px-1 py-6 text-[13px] text-[var(--color-ink3)]">Loading…</p>
      </section>
    )
  }

  if (entry.error) {
    return (
      <section class="mx-auto max-w-[920px]" data-testid="page-trace">
        <header class="mb-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
          <h1 class="font-display text-[24px] font-light text-[var(--color-ink)]">Entry trace</h1>
        </header>
        <p class="text-[13px] text-[var(--color-ember)]">
          Couldn't load this entry: {entry.error.message}
        </p>
      </section>
    )
  }

  const e = entry.data as any
  const type = (e?.type ?? 'message') as SigilKind
  const payload = e?.payload ?? {}
  const isTask = type === 'task'

  return (
    <section data-testid="page-trace" class="mx-auto max-w-[920px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <div class="flex items-center gap-3">
          <Sigil kind={type} size={20} bordered />
          <div>
            <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              {type}
            </div>
            <h1 class="font-display text-[24px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
              {summaryTitle(type, payload) ?? id}
            </h1>
          </div>
        </div>
        <div class="flex flex-col items-end gap-0.5 text-right">
          <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
            Entry
          </span>
          <span class="font-mono text-[12px] text-[var(--color-ember)]">{id}</span>
        </div>
      </header>

      <div class="mb-6 grid grid-cols-[140px_1fr] gap-y-2 text-[13px]">
        <Row
          label="From"
          value={
            <span class="font-mono text-[var(--color-ember)]" title={e?.agent_id ?? undefined}>
              {preferredName({ agent_id: e?.agent_id ?? '', display_name: e?.display_name })}
            </span>
          }
        />
        <Row
          label="Timestamp"
          value={
            <time>
              {e?.timestamp
                ? `${new Date(e.timestamp).toLocaleString()} · ${relTime(e.timestamp)}`
                : '—'}
            </time>
          }
        />
        {e?.refs && e.refs.length ? (
          <Row
            label="References"
            value={
              <div class="flex flex-wrap gap-1.5">
                {e.refs.map((r: string) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => route(`/trace/${r}`)}
                    class="font-mono text-[11px] text-[var(--color-ember)] hover:underline"
                  >
                    {r}
                  </button>
                ))}
              </div>
            }
          />
        ) : null}
      </div>

      {type === 'knowledge' ? <KnowledgeBody payload={payload} /> : null}
      {type === 'message' ? <MessageBody payload={payload} /> : null}
      {type === 'skill' ? <SkillBody payload={payload} /> : null}
      {isTask ? <TaskTimeline entry={e} /> : null}

      <section class="mt-8">
        <h2 class="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
          Referenced by
        </h2>
        {refs.loading ? (
          <p class="text-[13px] text-[var(--color-ink3)]">Loading…</p>
        ) : (refs.data as any[] | undefined)?.length === 0 ? (
          <p class="text-[13px] text-[var(--color-ink3)]">Nothing references this entry.</p>
        ) : (
          <div class="divide-y-[0.5px] divide-[var(--color-line)] border-y-[0.5px] border-[var(--color-line)]">
            {((refs.data as any[]) ?? []).map((r: any) => (
              <button
                type="button"
                key={r.id}
                onClick={() => route(`/trace/${r.id}`)}
                class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-mist)]/30"
              >
                <Sigil kind={r.type} size={12} bordered />
                <span class="flex-1 text-[13px] text-[var(--color-ink)]">
                  {summaryTitle(r.type, r.payload) ?? r.id}
                </span>
                <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
                  {relTime(r.timestamp)}
                </span>
                <span class="font-mono text-[10px] text-[var(--color-ink3)]">{r.id}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function Row({ label, value }: { label: string; value: preact.ComponentChildren }) {
  return (
    <>
      <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
        {label}
      </span>
      <span class="text-[var(--color-ink)]">{value}</span>
    </>
  )
}

function KnowledgeBody({ payload }: { payload: any }) {
  return (
    <div class="border-t-[0.5px] border-[var(--color-line)] pt-4">
      {payload.topic ? (
        <div class="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)]">
          {payload.topic}
        </div>
      ) : null}
      <p class="text-[15px] leading-[1.6] text-[var(--color-ink)]">{payload.content ?? ''}</p>
      {typeof payload.confidence === 'number' ? (
        <div class="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
          Confidence: <span class="text-[var(--color-ember)]">{payload.confidence.toFixed(2)}</span>
        </div>
      ) : null}
    </div>
  )
}

function MessageBody({ payload }: { payload: any }) {
  return (
    <div class="border-t-[0.5px] border-[var(--color-line)] pt-4">
      <p class="text-[15px] leading-[1.6] text-[var(--color-ink)]">{payload.content ?? ''}</p>
      {payload.to ? (
        <div class="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
          To: <span class="text-[var(--color-ember)]">{payload.to}</span>
        </div>
      ) : null}
    </div>
  )
}

function SkillBody({ payload }: { payload: any }) {
  return (
    <div class="border-t-[0.5px] border-[var(--color-line)] pt-4">
      <div class="flex items-baseline gap-3">
        <span class="font-display text-[18px] font-medium text-[var(--color-ink)]">
          {payload.name}
        </span>
        <span class="font-mono text-[12px] text-[var(--color-ink3)]">v{payload.version}</span>
        <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-sigil-skill)]">
          {payload.format}
        </span>
      </div>
      {payload.description ? (
        <p class="mt-2 text-[14px] leading-[1.6] text-[var(--color-ink2)]">{payload.description}</p>
      ) : null}
      {payload.checksum ? (
        <div class="mt-3 break-all font-mono text-[10px] text-[var(--color-ink3)]">
          {payload.checksum}
        </div>
      ) : null}
    </div>
  )
}

function TaskTimeline({ entry }: { entry: any }) {
  const history = entry.history ?? []
  return (
    <div class="border-t-[0.5px] border-[var(--color-line)] pt-4">
      <h2 class="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
        Lifecycle
      </h2>
      <ol class="space-y-3">
        {history.map((h: any, i: number) => (
          <li key={i} class="flex items-start gap-3">
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ember)]" />
            <div class="min-w-0 flex-1">
              <div class="text-[14px] text-[var(--color-ink)]">
                {h.payload?.status ? <strong class="font-medium">{h.payload.status}</strong> : null}
                {h.payload?.status ? ' · ' : null}
                <span class="font-mono text-[11px] text-[var(--color-ember)]" title={h.agent_id}>
                  {preferredName(h)}
                </span>
              </div>
              <time class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
                {new Date(h.timestamp).toLocaleString()}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function summaryTitle(type: SigilKind, payload: any): string | null {
  if (!payload) return null
  switch (type) {
    case 'knowledge':
      return typeof payload.content === 'string' ? payload.content.slice(0, 80) : null
    case 'task':
      return payload.title ?? null
    case 'skill':
      return `${payload.name ?? ''}${payload.version ? ` v${payload.version}` : ''}`
    case 'message':
      return typeof payload.content === 'string' ? payload.content.slice(0, 80) : null
    default:
      return null
  }
}
