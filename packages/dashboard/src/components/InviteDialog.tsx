/**
 * Invite minting dialog.
 *
 * Creator-only flow: pick a TTL, mint a one-time token, copy the
 * openpact.dev/join?invite=<token> share URL or the raw
 * `openpact join <token>` command. Lists outstanding invites
 * underneath with a revoke action.
 */
import { useEffect, useState } from 'preact/hooks'
import { usePact } from '../hooks/usePact'

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

export function InviteDialog({ onClose }: { onClose: () => void }) {
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
      class="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-canvas)]/85 p-6 backdrop-blur-sm"
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
              <span>
                Nonce {minted.nonce.slice(0, 8)}…{minted.nonce.slice(-4)}
              </span>
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
