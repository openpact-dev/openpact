import { useEffect, useState } from 'preact/hooks'

interface Props {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Optional second-step signal — e.g. typing the peer handle to confirm a remove. */
  requireTyping?: string
  /** Returns a promise so the dialog can show pending state and bubble errors up. */
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/**
 * Modal used for destructive or permission-scoped actions. Shows title,
 * body, optional "type to confirm" gate, then confirm / cancel.
 *
 * Body is plain text only — the dialog is safety rail, not surface area.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  requireTyping,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on escape.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, pending, onCancel])

  // Reset state on open.
  useEffect(() => {
    if (open) {
      setTyped('')
      setError(null)
      setPending(false)
    }
  }, [open])

  if (!open) return null

  const canConfirm =
    !pending && (requireTyping === undefined || typed.trim() === requireTyping.trim())

  const run = async () => {
    if (!canConfirm) return
    setPending(true)
    setError(null)
    try {
      await onConfirm()
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setPending(false)
    }
  }

  const confirmClass = destructive
    ? 'border-[var(--color-ember)] bg-[var(--color-ember-soft)] text-[var(--color-ember)] hover:bg-[var(--color-ember)] hover:text-[#fff]'
    : 'border-[var(--color-online)] text-[var(--color-online)] hover:bg-[var(--color-online)]/10'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-canvas)]/85 backdrop-blur-sm"
      onClick={() => (!pending ? onCancel() : null)}
    >
      <div
        class="relative w-[min(520px,90vw)] border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="border-b-[0.5px] border-[var(--color-line)] px-5 py-3.5">
          <h3 class="font-display text-[18px] font-medium text-[var(--color-ink)]">{title}</h3>
        </header>
        <div class="space-y-3 px-5 py-4">
          <p class="text-[14px] leading-[1.55] text-[var(--color-ink2)]">{description}</p>
          {requireTyping ? (
            <label class="block">
              <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
                Type <span class="text-[var(--color-ember)]">{requireTyping}</span> to confirm
              </span>
              <input
                type="text"
                value={typed}
                onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
                disabled={pending}
                autofocus
                class="mt-1.5 w-full rounded-none border-0 border-b-[0.5px] border-[var(--color-line)] bg-transparent px-1 py-1.5 font-mono text-[13px] text-[var(--color-ink)] outline-none focus:border-[var(--color-ember)]"
                data-testid="confirm-typing"
              />
            </label>
          ) : null}
          {error ? (
            <div class="border-l-2 border-[var(--color-ember)] bg-[var(--color-ember-soft)] px-3 py-2 text-[12px] text-[var(--color-ember-deep)]">
              {error}
            </div>
          ) : null}
        </div>
        <footer class="flex items-center justify-end gap-2 border-t-[0.5px] border-[var(--color-line)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            class="rounded-sm border-[0.5px] border-[var(--color-line)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)] hover:text-[var(--color-ink)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!canConfirm}
            data-testid="confirm-dialog-confirm"
            class={`rounded-sm border-[0.5px] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${confirmClass}`}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
