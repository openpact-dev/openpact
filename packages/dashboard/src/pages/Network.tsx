import { useState } from 'preact/hooks'
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
  last_seen?: string
}

type AdminAction = { kind: 'promote' | 'remove'; peer: PeerRow }

export function Network() {
  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0

  const status = useQuery(() => pact.status(), { key: `net:status:${pact.pactId}`, trigger })
  const peers = useQuery(() => pact.peers(), { key: `net:peers:${pact.pactId}`, trigger })

  const [pending, setPending] = useState<AdminAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const publicKey = status.data?.public_key ?? ''
  const pactId = status.data?.pact_id ?? ''
  const pactName = status.data?.pact_name ?? null
  const pactPurpose = status.data?.pact_purpose ?? null
  const displayName = status.data?.display_name ?? null
  const role = status.data?.role ?? ''
  const isCreator = role === 'creator'

  return (
    <section data-testid="page-network" class="mx-auto max-w-[1180px]">
      <header class="mb-6 flex items-end justify-between gap-6 border-b-[0.5px] border-[var(--color-line)] pb-4">
        <h1 class="font-display text-[28px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
          Network
        </h1>
        <span class="font-mono text-[12px] text-[var(--color-ink3)]">
          {(peers.data ?? []).length} peer{(peers.data ?? []).length === 1 ? '' : 's'}
        </span>
      </header>

      <section class="mb-8">
        <div class="mb-3 flex items-baseline justify-between">
          <h2 class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
            This pact
          </h2>
          {isCreator ? (
            <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ember)]">
              You're the creator
            </span>
          ) : null}
        </div>
        <PactInfoCard
          pactName={pactName}
          pactPurpose={pactPurpose}
          displayName={displayName}
          isCreator={isCreator}
          onRenamed={() => status.refetch()}
        />
      </section>

      <div class="mb-8 grid grid-cols-1 gap-3 md:grid-cols-2">
        <KeyCard label="This peer" value={publicKey} mono />
        <KeyCard label="Pact ID" value={pactId} mono />
      </div>

      <section>
        <div class="mb-3 flex items-baseline justify-between">
          <h2 class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
            Peers in this pact
          </h2>
          {isCreator ? (
            <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ember)]">
              You're the creator
            </span>
          ) : null}
        </div>
        {peers.loading ? (
          <p class="px-1 py-4 text-[13px] text-[var(--color-ink3)]">Loading…</p>
        ) : (peers.data ?? []).length === 0 ? (
          <p class="px-1 py-6 text-[13px] text-[var(--color-ink3)]" data-testid="network-empty">
            No peers yet. Share the public key above to invite one.
          </p>
        ) : (
          <div class="border-y-[0.5px] border-[var(--color-line)]">
            <div class="grid grid-cols-[1fr_100px_80px_100px] items-center gap-3 border-b-[0.5px] border-[var(--color-line)] px-5 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
              <span>Peer</span>
              <span>Role</span>
              <span>Status</span>
              <span class="text-right">Actions</span>
            </div>
            <div class="divide-y-[0.5px] divide-[var(--color-line)]">
              {(peers.data ?? []).map((p: PeerRow, i: number) => (
                <PeerRowView
                  key={p.id ?? p.remote_key ?? String(i)}
                  peer={p}
                  index={i}
                  canAdmin={isCreator}
                  onPromote={() => setPending({ kind: 'promote', peer: p })}
                  onRemove={() => setPending({ kind: 'remove', peer: p })}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'promote' ? 'Promote this peer to indexer?' : 'Remove this peer?'}
        description={
          pending?.kind === 'promote'
            ? `${shortHandle(pending.peer.id ?? pending.peer.remote_key ?? '')} will be allowed to confirm the frontier. You can demote again later.`
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

function KeyCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard disabled in some contexts; swallow
    }
  }
  return (
    <div class="border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/40 px-4 py-3">
      <div class="flex items-center justify-between">
        <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <div
        class={`mt-1.5 truncate ${mono ? 'font-mono' : ''} text-[13px] text-[var(--color-ink)]`}
        title={value}
      >
        {value || '—'}
      </div>
    </div>
  )
}

function PeerRowView({
  peer,
  index,
  canAdmin,
  onPromote,
  onRemove,
}: {
  peer: PeerRow
  index: number
  canAdmin: boolean
  onPromote: () => void
  onRemove: () => void
}) {
  const handle = peer.id ?? peer.remote_key ?? '?'
  return (
    <div
      class="animate-etch grid grid-cols-[1fr_100px_80px_100px] items-center gap-3 px-5 py-2.5"
      style={{ animationDelay: `${index * 25}ms` }}
      data-testid="peer-row"
    >
      <div class="min-w-0">
        <div class="truncate font-mono text-[12px] text-[var(--color-ember)]">
          {shortHandle(handle)}
        </div>
        <div class="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
          {peer.remote_key ? `${peer.remote_key.slice(0, 14)}…` : 'Local'}
        </div>
      </div>
      <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)]">
        {peer.role ?? 'reader'}
      </span>
      <span
        class={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
          peer.online ? 'text-[var(--color-online)]' : 'text-[var(--color-ink3)]'
        }`}
      >
        <span
          class={`inline-block h-1.5 w-1.5 rounded-full ${
            peer.online ? 'bg-[var(--color-online)]' : 'bg-[var(--color-offline)]'
          }`}
          aria-hidden="true"
        />
        {peer.online ? 'Online' : 'Offline'}
      </span>
      <div class="flex items-center justify-end gap-2">
        {canAdmin && peer.role !== 'creator' && peer.remote_key ? (
          <>
            {peer.role !== 'indexer' ? (
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

function PactInfoCard({
  pactName,
  pactPurpose,
  displayName,
  isCreator,
  onRenamed,
}: {
  pactName: string | null
  pactPurpose: string | null
  displayName: string | null
  isCreator: boolean
  onRenamed: () => void
}) {
  const pact = usePact()
  const [editing, setEditing] = useState<null | 'pact' | 'me'>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [purposeDraft, setPurposeDraft] = useState('')
  const [displayDraft, setDisplayDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startPactEdit = () => {
    setNameDraft(pactName ?? '')
    setPurposeDraft(pactPurpose ?? '')
    setError(null)
    setEditing('pact')
  }
  const startMeEdit = () => {
    setDisplayDraft(displayName ?? '')
    setError(null)
    setEditing('me')
  }

  const savePact = async () => {
    setSaving(true)
    setError(null)
    try {
      await pact.admin.setPactInfo({
        name: nameDraft.trim() || null,
        purpose: purposeDraft.trim() || null,
      })
      setEditing(null)
      onRenamed()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveMe = async () => {
    setSaving(true)
    setError(null)
    try {
      await pact.admin.setDisplayName(displayDraft.trim() || null)
      setEditing(null)
      onRenamed()
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
      {editing === 'pact' ? (
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
              onClick={() => setEditing(null)}
              disabled={saving}
              class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={savePact}
              disabled={saving}
              data-testid="pact-save"
              class="rounded-sm border-[0.5px] border-[var(--color-online)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-online)] hover:bg-[var(--color-online)]/10"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : editing === 'me' ? (
        <div class="space-y-3">
          <label class="block">
            <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              Your display name
            </span>
            <input
              class={`${INPUT} mt-1`}
              value={displayDraft}
              maxLength={64}
              onInput={(e) => setDisplayDraft((e.target as HTMLInputElement).value)}
              data-testid="display-name-input"
            />
            <span class="mt-1 block text-[11px] text-[var(--color-ink3)]">
              Advisory only — your canonical peer handle stays the same.
            </span>
          </label>
          {error ? <div class="text-[12px] text-[var(--color-ember)]">{error}</div> : null}
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={saving}
              class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveMe}
              disabled={saving}
              data-testid="me-save"
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
            <div class="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
              Your mark:{' '}
              <span class="text-[var(--color-ember)]">
                {displayName ?? <span class="italic">(handle)</span>}
              </span>
            </div>
          </div>
          <div class="flex items-start gap-2">
            {isCreator ? (
              <button
                type="button"
                onClick={startPactEdit}
                data-testid="pact-edit"
                class="rounded-sm border-[0.5px] border-[var(--color-line)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
              >
                Rename pact
              </button>
            ) : null}
            <button
              type="button"
              onClick={startMeEdit}
              data-testid="me-edit"
              class="rounded-sm border-[0.5px] border-[var(--color-line)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink2)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
            >
              Rename me
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
