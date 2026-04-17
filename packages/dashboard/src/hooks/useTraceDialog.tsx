import { createContext } from 'preact'
import { useCallback, useContext, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

/**
 * Ambient entry-trace dialog.
 *
 * The trace view used to be a top-level route (`/trace/:id`) that
 * replaced the current page. Every card in the dashboard (feed,
 * Knowledge grid, Tasks board, Messages wire, thread replies) opened
 * it, which meant you lost your spot on the page you came from.
 *
 * The modal keeps the previous page visible behind it. We deliberately
 * don't sync id with the URL: preact-router re-runs its matcher on
 * pushState, so every open/close would swap the page below the modal
 * (defeating the point). Deep links `/trace/:id` are handled by the
 * route stub in `pages/Trace.tsx`, which opens the dialog once on
 * mount and redirects to `/`.
 */

interface TraceDialogState {
  /** Currently-open entry id, or null when closed. */
  id: string | null
  /** Open the dialog. */
  open(id: string): void
  /** Close the dialog. */
  close(): void
}

const TraceDialogContext = createContext<TraceDialogState | null>(null)

export function TraceDialogProvider({ children }: { children: ComponentChildren }) {
  const [id, setId] = useState<string | null>(null)
  const open = useCallback((next: string) => setId(next), [])
  const close = useCallback(() => setId(null), [])
  return (
    <TraceDialogContext.Provider value={{ id, open, close }}>
      {children}
    </TraceDialogContext.Provider>
  )
}

export function useTraceDialog(): TraceDialogState {
  const ctx = useContext(TraceDialogContext)
  if (!ctx) throw new Error('useTraceDialog must be used inside TraceDialogProvider')
  return ctx
}
