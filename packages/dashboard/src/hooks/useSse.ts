import { createContext, h } from 'preact'
import type { ComponentChildren } from 'preact'
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks'

export interface SseEvent {
  /** Event type (e.g. 'entry-applied', 'peer-add', 'update'). */
  event: string
  /** Parsed JSON payload, or the raw text if it didn't parse. */
  data: unknown
  /** Monotonic counter so consumers can detect "new event arrived" via reference equality. */
  seq: number
}

interface UseSseOpts {
  /** Stream URL. Default '/api/v1/events' (proxied to the daemon's /v1/events). */
  url?: string
  /** When false, the hook does not open a connection. Useful in tests. */
  enabled?: boolean
}

export interface UseSseResult {
  last: SseEvent | undefined
  byType: Record<string, SseEvent>
  connected: boolean
  reconnecting: boolean
  error: Error | undefined
  lastEventAt: number | undefined
}

const SseContext = createContext<UseSseResult | null>(null)

const EVENTS = [
  'entry-applied',
  'invalid-entry',
  'peer-add',
  'peer-remove',
  'member-online',
  'member-offline',
  'update',
] as const

/**
 * Subscribe to the daemon's SSE stream. Returns the latest event by
 * type plus the most recent event overall.
 *
 * The browser's EventSource auto-reconnects on its own; we don't have
 * to manage that. Cleanup on unmount closes the connection.
 */
export function useSse(opts: UseSseOpts = {}): UseSseResult {
  const url = opts.url ?? '/api/v1/events'
  const enabled = opts.enabled ?? true
  const [last, setLast] = useState<SseEvent | undefined>(undefined)
  const [byType, setByType] = useState<Record<string, SseEvent>>({})
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [lastEventAt, setLastEventAt] = useState<number | undefined>(undefined)
  const openedRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setConnected(false)
      setReconnecting(false)
      setError(undefined)
      return
    }
    if (typeof EventSource === 'undefined') {
      setConnected(false)
      setReconnecting(false)
      setError(new Error('EventSource is unavailable in this browser.'))
      return
    }

    openedRef.current = false
    const es = new EventSource(url)
    let seq = 0
    const listeners = new Map<string, EventListener>()

    const markConnected = () => {
      openedRef.current = true
      setConnected(true)
      setReconnecting(false)
      setError(undefined)
      setLastEventAt(Date.now())
    }

    const handle = (event: string) => (e: MessageEvent) => {
      seq++
      let parsed: unknown
      try {
        parsed = JSON.parse(e.data)
      } catch {
        parsed = e.data
      }
      const next: SseEvent = { event, data: parsed, seq }
      markConnected()
      setLast(next)
      setByType((prev) => ({ ...prev, [event]: next }))
      setLastEventAt(Date.now())
    }

    es.onopen = () => {
      markConnected()
    }
    es.onerror = () => {
      setConnected(false)
      setReconnecting(openedRef.current)
      setError(
        new Error(
          openedRef.current
            ? 'Lost live connection to the daemon. Reconnecting…'
            : 'Could not connect to the daemon live updates.',
        ),
      )
    }

    for (const ev of EVENTS) {
      const listener = handle(ev) as EventListener
      listeners.set(ev, listener)
      es.addEventListener(ev, listener)
    }

    return () => {
      for (const [event, listener] of listeners) es.removeEventListener(event, listener)
      es.onopen = null
      es.onerror = null
      es.close()
    }
  }, [url, enabled])

  return useMemo(
    () => ({ last, byType, connected, reconnecting, error, lastEventAt }),
    [last, byType, connected, reconnecting, error, lastEventAt],
  )
}

export function SseProvider({ children }: { children: ComponentChildren }) {
  const value = useSse()
  return h(SseContext.Provider, { value }, children)
}

export function useSharedSse(): UseSseResult {
  const value = useContext(SseContext)
  if (!value) {
    throw new Error('useSharedSse must be used inside <SseProvider>.')
  }
  return value
}
