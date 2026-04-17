import { useEffect } from 'preact/hooks'
import { useTraceDialog } from '../hooks/useTraceDialog'
import { TraceView } from '../pages/Trace'

/**
 * Modal overlay for the entry-trace view. Mounted once at the App
 * shell; stays dormant (renders nothing) until `useTraceDialog()` has
 * an active id, at which point it pops up over the current page.
 *
 * Dismiss: click the backdrop, hit ✕, or press Escape. All three
 * route through `dialog.close()` so history stays in sync.
 */
export function TraceDialog() {
  const { id, close } = useTraceDialog()

  // Esc-to-close. Attached only while the dialog is open so the
  // document-level listener doesn't leak or intercept other pages.
  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, close])

  // Lock body scroll while the dialog is open so the page behind
  // doesn't scroll when the user wheels over the backdrop or the
  // bottom of the modal.
  useEffect(() => {
    if (!id) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [id])

  if (!id) return null

  return (
    <div
      class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[var(--color-canvas)]/85 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Entry trace"
      data-testid="trace-dialog"
      onClick={close}
    >
      <div
        class="relative w-full max-w-[820px] border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] px-8 py-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          data-testid="trace-dialog-close"
          class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center border-[0.5px] border-[var(--color-line)] font-mono text-[12px] text-[var(--color-ink2)] transition-colors hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
        >
          ×
        </button>
        <TraceView id={id} />
      </div>
    </div>
  )
}
