import { useMemo, useState } from 'preact/hooks'
import { route } from 'preact-router'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useDashboardConnection } from '../hooks/useDashboardConnection'
import { useSharedSse } from '../hooks/useSse'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { InviteDialog } from '../components/InviteDialog'
import { PactEditDialog } from '../components/PactEditDialog'
import { PactlessState } from '../components/PactlessState'
import { eventSeqForPact } from '../lib/events'
import { shortHandle } from '../lib/format'

interface AgentRow {
  id?: string
  remote_key?: string
  role?: string
  online?: boolean
  entries?: number
  display_name?: string | null
  is_self?: boolean
}

type AdminAction = { kind: 'promote' | 'remove'; agent: AgentRow }

/** One unified row type covering the self-agent and every remote peer. */
interface UnifiedRow {
  handle: string
  displayName: string | null
  publicKey: string | null
  role: string
  online: boolean
  isSelf: boolean
}

export interface NetworkProps {
  /** Local alias of the current pact, threaded through from App. */
  currentAlias?: string | null
  /** Fires after the pact registry changes (e.g. local alias renamed). */
  onPactChange?: () => void
}

export function Network({ currentAlias = null, onPactChange }: NetworkProps) {
  const pact = usePact()
  if (!pact.pactId) {
    return (
      <PactlessState
        page="Network"
        action="The agent roster populates once a pact exists. Create or join one to see agents light up."
      />
    )
  }
  return <NetworkPage currentAlias={currentAlias} onPactChange={onPactChange} />
}

function NetworkPage({
  currentAlias,
  onPactChange,
}: {
  currentAlias: string | null
  onPactChange?: () => void
}) {
  const pact = usePact()
  const sse = useSharedSse()
  const connection = useDashboardConnection()
  const trigger = eventSeqForPact(sse.last, pact.pactId, [
    'entry-applied',
    'member-online',
    'member-offline',
    'update',
  ])

  const status = useQuery(() => pact.status(), { key: `net:status:${pact.pactId}`, trigger })
  const agents = useQuery(() => pact.agents(), { key: `net:agents:${pact.pactId}`, trigger })

  const [pending, setPending] = useState<AdminAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [editing, setEditing] = useState<null | 'pact' | 'self'>(null)

  const s = status.data
  const pactId = s?.pact_id ?? ''
  const pactName = s?.pact_name ?? null
  const pactPurpose = s?.pact_purpose ?? null
  const selfDisplay = s?.display_name ?? null
  const selfRole = s?.role ?? 'Pending'
  const isCreator = selfRole === 'creator'

  // The daemon now returns self as the first row of /agents, so we just
  // project each entry into the unified shape. Self's `online` reflects
  // its presence in the authenticated member set on the daemon; when the
  // dashboard is talking to the daemon we are definitionally online, so
  // we also OR in the dashboard-connection signal to smooth over brief
  // proxy hiccups.
  const rows: UnifiedRow[] = useMemo(() => {
    const list = agents.data ?? []
    return list.map((a: AgentRow) => ({
      handle: a.id ?? a.remote_key ?? '',
      displayName: a.display_name ?? null,
      publicKey: a.remote_key ?? null,
      role: a.role ?? 'member',
      online: a.is_self ? !!a.online && connection.daemonReachable !== false : !!a.online,
      isSelf: !!a.is_self,
    }))
  }, [agents.data, connection.daemonReachable])

  return (
    <section data-testid="page-network" class="mx-auto max-w-[1180px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Network
        </h1>
        <div class="flex items-center gap-4">
          <span class="font-mono text-[12px] text-[var(--color-ink3)]">
            {rows.length} agent{rows.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            data-testid="invite-open"
            class="border-[0.5px] border-[var(--color-ember)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)] hover:bg-[var(--color-ember)]/10"
          >
            Share invite
          </button>
        </div>
      </header>

      <section class="mb-6">
        <PactInfoCard
          pactName={pactName}
          pactPurpose={pactPurpose}
          pactId={pactId}
          canEdit={!!currentAlias}
          onStartEdit={() => setEditing('pact')}
        />
      </section>

      <section>
        <div class="mb-3 flex items-baseline justify-between">
          <h2 class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
            Agents in this pact
          </h2>
        </div>
        {status.loading && !s ? (
          <p class="px-1 py-4 text-[13px] text-[var(--color-ink3)]">Loading…</p>
        ) : status.error && !s ? (
          <p class="px-1 py-4 text-[13px] text-[var(--color-ember)]">
            Couldn&apos;t load the network right now.
          </p>
        ) : (
          <div class="border-y-[0.5px] border-[var(--color-line)]">
            <div class="grid grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr_0.9fr] items-center gap-3 border-b-[0.5px] border-[var(--color-line)] px-5 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
              <span>Agent</span>
              <span>Role</span>
              <span>Rights</span>
              <span>Status</span>
              <span class="text-right">Actions</span>
            </div>
            <div class="divide-y-[0.5px] divide-[var(--color-line)]">
              {rows.map((r, i) => (
                <AgentRowView
                  key={r.handle || String(i)}
                  row={r}
                  index={i}
                  canAdmin={isCreator}
                  onRenameSelf={() => setEditing('self')}
                  onPromote={() =>
                    setPending({
                      kind: 'promote',
                      agent: { id: r.handle, remote_key: r.publicKey ?? undefined, role: r.role },
                    })
                  }
                  onRemove={() =>
                    setPending({
                      kind: 'remove',
                      agent: { id: r.handle, remote_key: r.publicKey ?? undefined, role: r.role },
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {editing === 'self' ? (
        <RenameAgentDialog
          initial={selfDisplay ?? ''}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            status.refetch()
          }}
        />
      ) : null}

      {editing === 'pact' && currentAlias ? (
        <PactEditDialog
          alias={currentAlias}
          pactName={pactName}
          pactPurpose={pactPurpose}
          isCreator={isCreator}
          onCancel={() => setEditing(null)}
          onSaved={({ newAlias, infoChanged }) => {
            setEditing(null)
            if (infoChanged) status.refetch()
            if (newAlias) {
              // Pin the new alias locally so the switcher and a
              // page reload both land on it, then nudge the app
              // to refresh the pact registry + route back to the
              // network page (which will re-mount with the new
              // current). The old alias is gone; staying on its
              // client would 404 on the next fetch.
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('openpact:current-pact', newAlias)
              }
              onPactChange?.()
              route('/network')
            }
          }}
        />
      ) : null}

      {showInvite ? <InviteDialog onClose={() => setShowInvite(false)} /> : null}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'promote' ? 'Promote to indexer?' : 'Remove this agent?'}
        description={
          pending?.kind === 'promote'
            ? `${shortHandle(pending.agent.id ?? pending.agent.remote_key ?? '')} will be allowed to confirm the frontier. They can be demoted again later.`
            : pending
              ? `${shortHandle(pending.agent.id ?? pending.agent.remote_key ?? '')} will lose future pact access. Existing entries remain in the ledger.`
              : ''
        }
        confirmLabel={pending?.kind === 'promote' ? 'Promote' : 'Remove'}
        destructive={pending?.kind === 'remove'}
        requireTyping={
          pending?.kind === 'remove'
            ? shortHandle(pending.agent.id ?? pending.agent.remote_key ?? '')
            : undefined
        }
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return
          const key = pending.agent.remote_key ?? ''
          if (!key) throw new Error('No remote key for this agent')
          if (pending.kind === 'promote') {
            await pact.admin.promoteToIndexer(key)
            setToast(`Promoted ${shortHandle(pending.agent.id ?? key)}.`)
          } else {
            await pact.admin.removeMemberAsCreator(key)
            setToast(`Removed ${shortHandle(pending.agent.id ?? key)}.`)
          }
          setPending(null)
          agents.refetch()
          setTimeout(() => setToast(null), 3000)
        }}
      />

      {toast ? (
        <div
          class="fixed bottom-6 right-6 z-50 border-[0.5px] border-[var(--color-online)] bg-[var(--color-paper)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-online)] shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </section>
  )
}

/* -------------------------------- rows --------------------------------- */

function AgentRowView({
  row,
  index,
  canAdmin,
  onRenameSelf,
  onPromote,
  onRemove,
}: {
  row: UnifiedRow
  index: number
  canAdmin: boolean
  onRenameSelf: () => void
  onPromote: () => void
  onRemove: () => void
}) {
  const rightsLabel = describeRights(row.role)
  const name = row.displayName ?? shortHandle(row.handle)

  return (
    <div
      class="animate-etch grid grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr_0.9fr] items-center gap-3 px-5 py-3"
      style={{ animationDelay: `${index * 25}ms` }}
      data-testid={row.isSelf ? 'agent-row-self' : 'agent-row'}
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="truncate text-[14px] text-[var(--color-ink)]">{name}</span>
          {row.isSelf ? (
            <span class="border-[0.5px] border-[var(--color-ember)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ember)]">
              Self
            </span>
          ) : null}
        </div>
        <div class="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
          {shortHandle(row.handle) || '—'}
        </div>
      </div>
      <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)]">
        {row.role || 'Pending'}
      </span>
      <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)]">
        {rightsLabel}
      </span>
      <span
        class={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
          row.online ? 'text-[var(--color-online)]' : 'text-[var(--color-ink3)]'
        }`}
      >
        <span
          class={`inline-block h-1.5 w-1.5 rounded-full ${
            row.online ? 'bg-[var(--color-online)]' : 'bg-[var(--color-offline)]'
          }`}
          aria-hidden="true"
        />
        {row.online ? 'Online' : 'Offline'}
      </span>
      <div class="flex items-center justify-end gap-2">
        {row.isSelf ? (
          <button
            type="button"
            onClick={onRenameSelf}
            data-testid="self-rename"
            class="border-[0.5px] border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
          >
            Rename
          </button>
        ) : canAdmin && row.role !== 'creator' && row.publicKey ? (
          <>
            {row.role !== 'indexer' ? (
              <button
                type="button"
                onClick={onPromote}
                data-testid="peer-promote"
                class="border-[0.5px] border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)] hover:border-[var(--color-online)] hover:text-[var(--color-online)]"
              >
                Promote
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemove}
              data-testid="peer-remove"
              class="border-[0.5px] border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
            >
              Remove
            </button>
          </>
        ) : (
          <span class="font-mono text-[10px] text-[var(--color-ink3)]">—</span>
        )}
      </div>
    </div>
  )
}

function describeRights(role: string): string {
  switch (role) {
    case 'creator':
    case 'indexer':
      return 'Write + index'
    case 'member':
      return 'Write'
    default:
      return 'Pending'
  }
}

/* -------------------------- pact info card ----------------------------- */

/**
 * Read-only summary of the current pact's name + purpose. The "Edit
 * pact" button opens {@link PactEditDialog} — the same dialog the
 * /pacts page uses, so name/purpose changes (synced) and local alias
 * changes (per-host) share one surface.
 */
function PactInfoCard({
  pactName,
  pactPurpose,
  pactId,
  canEdit,
  onStartEdit,
}: {
  pactName: string | null
  pactPurpose: string | null
  pactId: string
  canEdit: boolean
  onStartEdit: () => void
}) {
  return (
    <div
      class="border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/40 px-5 py-4"
      data-testid="pact-info"
    >
      <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <div class="min-w-0">
          <div class="font-display text-[18px] leading-tight text-[var(--color-ink)]">
            {pactName ?? <span class="italic text-[var(--color-ink3)]">Unnamed pact</span>}
          </div>
          <div class="mt-1 text-[13px] leading-[1.5] text-[var(--color-ink2)]">
            {pactPurpose ?? <span class="italic text-[var(--color-ink3)]">No purpose set.</span>}
          </div>
          <div
            class="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]"
            title={pactId}
          >
            ID: {pactId.slice(0, 16)}…
          </div>
        </div>
        {canEdit ? (
          <div class="flex items-start">
            <button
              type="button"
              onClick={onStartEdit}
              data-testid="pact-edit"
              class="rounded-sm border-[0.5px] border-[var(--color-line)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
            >
              Edit pact
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* -------------------------- rename agent dialog ------------------------ */

function RenameAgentDialog({
  initial,
  onCancel,
  onSaved,
}: {
  initial: string
  onCancel: () => void
  onSaved: () => void
}) {
  const pact = usePact()
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await pact.admin.setDisplayName(draft.trim() || null)
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      class="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-canvas)]/85 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        class="w-full max-w-sm border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 class="mb-1 font-display text-[18px] leading-tight text-[var(--color-ink)]">
          Rename agent
        </h3>
        <p class="mb-3 text-[12px] leading-[1.5] text-[var(--color-ink2)]">
          Advisory only. The canonical agent handle stays the same.
        </p>
        <input
          class="w-full rounded-none border-0 border-b-[0.5px] border-[var(--color-line)] bg-transparent px-1 py-1.5 text-[14px] text-[var(--color-ink)] outline-none focus:border-[var(--color-ember)]"
          value={draft}
          maxLength={64}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          data-testid="display-name-input"
          autoFocus
        />
        {error ? <div class="mt-2 text-[12px] text-[var(--color-ember)]">{error}</div> : null}
        <div class="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            data-testid="self-save"
            class="rounded-sm border-[0.5px] border-[var(--color-online)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-online)] hover:bg-[var(--color-online)]/10"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
