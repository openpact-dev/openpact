import { useEffect, useMemo, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { shortHandle } from '../lib/format'

interface PeerRow {
  id?: string
  remote_key?: string
  role?: string
  online?: boolean
  entries?: number
  display_name?: string | null
}

type AdminAction = { kind: 'promote' | 'remove'; peer: PeerRow }

/** One unified row type covering the self-agent and every remote peer. */
interface UnifiedRow {
  handle: string
  displayName: string | null
  publicKey: string | null
  role: string
  online: boolean
  isSelf: boolean
}

export function Network() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0

  const status = useQuery(() => pact.status(), { key: `net:status:${pact.pactId}`, trigger })
  const peers = useQuery(() => pact.peers(), { key: `net:peers:${pact.pactId}`, trigger })

  const [pending, setPending] = useState<AdminAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [editing, setEditing] = useState<null | 'pact' | 'self'>(null)

  const s = status.data
  const pactId = s?.pact_id ?? ''
  const pactName = s?.pact_name ?? null
  const pactPurpose = s?.pact_purpose ?? null
  const selfHandle = s?.peer_handle ?? ''
  const selfDisplay = s?.display_name ?? null
  const selfRole = s?.role ?? 'reader'
  const selfPublicKey = s?.public_key ?? ''
  const isCreator = selfRole === 'creator'

  // Fold self + remote peers into one list so the self-agent sits in the
  // table like any other row. The self-row is always pinned to the top.
  const rows: UnifiedRow[] = useMemo(() => {
    const self: UnifiedRow = {
      handle: selfHandle,
      displayName: selfDisplay,
      publicKey: selfPublicKey,
      role: selfRole,
      online: true,
      isSelf: true,
    }
    const others: UnifiedRow[] = (peers.data ?? []).map((p: PeerRow) => ({
      handle: p.id ?? p.remote_key ?? '',
      displayName: p.display_name ?? null,
      publicKey: p.remote_key ?? null,
      role: p.role ?? 'reader',
      online: !!p.online,
      isSelf: false,
    }))
    return [self, ...others]
  }, [peers.data, selfHandle, selfDisplay, selfPublicKey, selfRole])

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
          editing={editing === 'pact'}
          canEdit={isCreator}
          onStartEdit={() => setEditing('pact')}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            status.refetch()
          }}
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
                      peer: { id: r.handle, remote_key: r.publicKey ?? undefined, role: r.role },
                    })
                  }
                  onRemove={() =>
                    setPending({
                      kind: 'remove',
                      peer: { id: r.handle, remote_key: r.publicKey ?? undefined, role: r.role },
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

      {showInvite ? <InviteDialog onClose={() => setShowInvite(false)} /> : null}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'promote' ? 'Promote to indexer?' : 'Remove this agent?'}
        description={
          pending?.kind === 'promote'
            ? `${shortHandle(pending.peer.id ?? pending.peer.remote_key ?? '')} will be allowed to confirm the frontier. They can be demoted again later.`
            : pending
              ? `${shortHandle(pending.peer.id ?? pending.peer.remote_key ?? '')} will lose write access. Existing entries remain in the ledger.`
              : ''
        }
        confirmLabel={pending?.kind === 'promote' ? 'Promote' : 'Remove'}
        destructive={pending?.kind === 'remove'}
        requireTyping={
          pending?.kind === 'remove'
            ? shortHandle(pending.peer.id ?? pending.peer.remote_key ?? '')
            : undefined
        }
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return
          const key = pending.peer.remote_key ?? ''
          if (!key) throw new Error('No remote key for this peer')
          if (pending.kind === 'promote') {
            await pact.admin.promote(key)
            setToast(`Promoted ${shortHandle(pending.peer.id ?? key)}.`)
          } else {
            await pact.admin.remove(key)
            setToast(`Removed ${shortHandle(pending.peer.id ?? key)}.`)
          }
          setPending(null)
          peers.refetch()
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
        {row.role || 'reader'}
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
    case 'writer':
      return 'Write only'
    default:
      return 'Read only'
  }
}

/* -------------------------- pact info card ----------------------------- */

function PactInfoCard({
  pactName,
  pactPurpose,
  pactId,
  editing,
  canEdit,
  onStartEdit,
  onCancel,
  onSaved,
}: {
  pactName: string | null
  pactPurpose: string | null
  pactId: string
  editing: boolean
  canEdit: boolean
  onStartEdit: () => void
  onCancel: () => void
  onSaved: () => void
}) {
  const pact = usePact()
  const [nameDraft, setNameDraft] = useState(pactName ?? '')
  const [purposeDraft, setPurposeDraft] = useState(pactPurpose ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed the drafts whenever we enter edit mode so the form shows the
  // current values, not whatever was last typed.
  useEffect(() => {
    if (editing) {
      setNameDraft(pactName ?? '')
      setPurposeDraft(pactPurpose ?? '')
      setError(null)
    }
  }, [editing, pactName, pactPurpose])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await pact.admin.setPactInfo({
        name: nameDraft.trim() || null,
        purpose: purposeDraft.trim() || null,
      })
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const INPUT =
    'w-full rounded-none border-0 border-b-[0.5px] border-[var(--color-line)] bg-transparent px-1 py-1.5 text-[14px] text-[var(--color-ink)] outline-none focus:border-[var(--color-ember)]'

  return (
    <div
      class="border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/40 px-5 py-4"
      data-testid="pact-info"
    >
      {editing ? (
        <div class="space-y-3">
          <label class="block">
            <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              Pact name
            </span>
            <input
              class={`${INPUT} mt-1`}
              value={nameDraft}
              maxLength={64}
              onInput={(e) => setNameDraft((e.target as HTMLInputElement).value)}
              data-testid="pact-name-input"
            />
          </label>
          <label class="block">
            <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              Purpose
            </span>
            <input
              class={`${INPUT} mt-1`}
              value={purposeDraft}
              maxLength={200}
              onInput={(e) => setPurposeDraft((e.target as HTMLInputElement).value)}
              data-testid="pact-purpose-input"
            />
          </label>
          {error ? <div class="text-[12px] text-[var(--color-ember)]">{error}</div> : null}
          <div class="flex items-center justify-end gap-2">
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
              data-testid="pact-save"
              class="rounded-sm border-[0.5px] border-[var(--color-online)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-online)] hover:bg-[var(--color-online)]/10"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
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
      )}
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
      class="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-ink)]/40 p-6"
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
          Advisory only. The canonical peer handle stays the same.
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

/* ------------------------------ invite --------------------------------- */

const TTL_OPTIONS: Array<{ label: string; ms: number }> = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
]

interface Minted {
  token: string
  share_url: string
  nonce: string
  expires_at: string
}

function formatUntil(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return 'expired'
  const d = Math.floor(ms / 86_400_000)
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}`
  const h = Math.floor(ms / 3_600_000)
  if (h > 0) return `${h} hour${h === 1 ? '' : 's'}`
  const m = Math.max(1, Math.floor(ms / 60_000))
  return `${m} minute${m === 1 ? '' : 's'}`
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const pact = usePact()
  const [copiedWhat, setCopiedWhat] = useState<null | 'url' | 'cmd'>(null)
  const [ttlMs, setTtlMs] = useState<number>(7 * 24 * 60 * 60 * 1000)
  const [minting, setMinting] = useState(false)
  const [minted, setMinted] = useState<Minted | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outstanding, setOutstanding] = useState<
    Array<{ nonce: string; expires_at: string; pact_name: string | null }>
  >([])
  const [revokingNonce, setRevokingNonce] = useState<string | null>(null)

  const refreshList = async () => {
    try {
      const all = await pact.invites.list()
      setOutstanding(all.filter((i) => !i.dead))
    } catch {
      /* no-op; dialog can still mint */
    }
  }

  useEffect(() => {
    void refreshList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mint = async () => {
    setMinting(true)
    setError(null)
    try {
      const res = await pact.invites.create({ ttlMs })
      setMinted(res)
      await refreshList()
    } catch (e) {
      setError((e as Error).message || 'failed to mint invite')
    } finally {
      setMinting(false)
    }
  }

  const revoke = async (nonce: string) => {
    setRevokingNonce(nonce)
    try {
      await pact.invites.revoke(nonce)
      await refreshList()
    } catch (e) {
      setError((e as Error).message || 'failed to revoke')
    } finally {
      setRevokingNonce(null)
    }
  }

  const copy = async (value: string, which: 'url' | 'cmd') => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedWhat(which)
      setTimeout(() => setCopiedWhat(null), 1500)
    } catch {
      /* clipboard API may be gated in some contexts; ignore */
    }
  }

  const joinCmd = minted ? `openpact join ${minted.token}` : ''

  return (
    <div
      class="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-ink)]/40 p-6"
      role="dialog"
      aria-modal="true"
      data-testid="invite-dialog"
      onClick={onClose}
    >
      <div
        class="w-full max-w-xl border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 class="mb-1 font-display text-[20px] leading-tight text-[var(--color-ink)]">
          Mint an invite
        </h3>
        <p class="mb-5 text-[13px] leading-[1.5] text-[var(--color-ink2)]">
          One-time, time-limited token. The recipient becomes a writer as soon as they redeem.
          Revoke anytime before it's spent.
        </p>

        {!minted ? (
          <>
            <div class="mb-5">
              <div class="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
                Expires in
              </div>
              <div class="flex flex-wrap gap-2">
                {TTL_OPTIONS.map((opt) => (
                  <button
                    key={opt.ms}
                    type="button"
                    onClick={() => setTtlMs(opt.ms)}
                    class={`border-[0.5px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors ${
                      ttlMs === opt.ms
                        ? 'border-[var(--color-ember)] bg-[var(--color-ember)]/10 text-[var(--color-ember)]'
                        : 'border-[var(--color-line)] text-[var(--color-ink2)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div class="mb-4 border-[0.5px] border-[var(--color-ember)]/40 bg-[var(--color-ember)]/5 px-3 py-2 font-mono text-[11px] text-[var(--color-ember)]">
                {error}
              </div>
            ) : null}

            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={minting}
                onClick={() => void mint()}
                data-testid="invite-mint"
                class="rounded-sm border-[0.5px] border-[var(--color-ember)] bg-[var(--color-ember)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-paper)] disabled:opacity-60"
              >
                {minting ? 'Minting…' : 'Mint invite'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div class="mb-4">
              <div class="mb-2 flex items-baseline justify-between">
                <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
                  Share URL
                </span>
                <button
                  type="button"
                  onClick={() => copy(minted.share_url, 'url')}
                  data-testid="invite-copy-url"
                  class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                >
                  {copiedWhat === 'url' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <div
                class="select-all break-all border-[0.5px] border-[var(--color-ember)]/40 bg-[var(--color-ember)]/5 px-3 py-2 font-mono text-[12px] text-[var(--color-ink)]"
                title={minted.share_url}
              >
                {minted.share_url}
              </div>
            </div>

            <div class="mb-4">
              <div class="mb-2 flex items-baseline justify-between">
                <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
                  Or paste this command
                </span>
                <button
                  type="button"
                  onClick={() => copy(joinCmd, 'cmd')}
                  data-testid="invite-copy-cmd"
                  class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
                >
                  {copiedWhat === 'cmd' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <div class="select-all break-all border-[0.5px] border-[var(--color-line)] bg-[var(--color-mist)]/30 px-3 py-2 font-mono text-[12px] text-[var(--color-ink)]">
                {joinCmd}
              </div>
            </div>

            <div class="mb-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
              <span>Nonce {minted.nonce.slice(0, 8)}…{minted.nonce.slice(-4)}</span>
              <span>Expires in {formatUntil(minted.expires_at)}</span>
            </div>

            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMinted(null)
                  setCopiedWhat(null)
                }}
                class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ink)]"
              >
                Mint another
              </button>
              <button
                type="button"
                onClick={onClose}
                class="rounded-sm border-[0.5px] border-[var(--color-ember)] bg-[var(--color-ember)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-paper)]"
              >
                Done
              </button>
            </div>
          </>
        )}

        {outstanding.length > 0 ? (
          <div class="mt-6 border-t-[0.5px] border-[var(--color-line)] pt-4">
            <div class="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              Outstanding invites ({outstanding.length})
            </div>
            <ul class="space-y-1.5">
              {outstanding.map((inv) => (
                <li
                  key={inv.nonce}
                  class="flex items-center justify-between gap-3 font-mono text-[11px] text-[var(--color-ink2)]"
                >
                  <span>
                    {inv.nonce.slice(0, 8)}…{inv.nonce.slice(-4)} · expires in{' '}
                    {formatUntil(inv.expires_at)}
                  </span>
                  <button
                    type="button"
                    disabled={revokingNonce === inv.nonce}
                    onClick={() => void revoke(inv.nonce)}
                    class="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)] hover:text-[var(--color-ember)] disabled:opacity-60"
                  >
                    {revokingNonce === inv.nonce ? 'Revoking…' : 'Revoke'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
