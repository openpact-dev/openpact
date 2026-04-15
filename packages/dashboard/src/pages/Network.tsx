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

  const status = useQuery(() => pact.status(), { key: 'net:status', trigger })
  const peers = useQuery(() => pact.peers(), { key: 'net:peers', trigger })

  const [pending, setPending] = useState<AdminAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const publicKey = status.data?.public_key ?? ''
  const pactId = status.data?.pact_id ?? ''
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
