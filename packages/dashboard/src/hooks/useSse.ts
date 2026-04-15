import { useEffect, useState } from 'preact/hooks'

export interface SseEvent {
  /** Event type (e.g. 'entry-applied', 'peer-add', 'update'). */
  event: string
  /** Parsed JSON payload, or the raw text if it didn't parse. */
  data: unknown
  /** Monotonic counter so consumers can detect "new event arrived" via reference equality. */
  seq: number
}

interface UseSseOpts {
  /** Stream URL. Default '/api/events' (proxied to the daemon's /v1/events). */
  url?: string
  /** When false, the hook does not open a connection. Useful in tests. */
  enabled?: boolean
}

/**
 * Subscribe to the daemon's SSE stream. Returns the latest event by
 * type plus the most recent event overall.
 *
 * The browser's EventSource auto-reconnects on its own; we don't have
 * to manage that. Cleanup on unmount closes the connection.
 */
export function useSse(opts: UseSseOpts = {}): {
  last: SseEvent | undefined
  byType: Record<string, SseEvent>
} {
  const url = opts.url ?? '/api/events'
  const enabled = opts.enabled ?? true
  const [last, setLast] = useState<SseEvent | undefined>(undefined)
  const [byType, setByType] = useState<Record<string, SseEvent>>({})

  useEffect(() => {
    if (!enabled) return
    if (typeof EventSource === 'undefined') return

    const es = new EventSource(url)
    let seq = 0

    const handle = (event: string) => (e: MessageEvent) => {
      seq++
      let parsed: unknown
      try {
        parsed = JSON.parse(e.data)
      } catch {
        parsed = e.data
      }
      const next: SseEvent = { event, data: parsed, seq }
      setLast(next)
      setByType((prev) => ({ ...prev, [event]: next }))
    }

    const events = ['entry-applied', 'invalid-entry', 'peer-add', 'peer-remove', 'update']
    for (const ev of events) es.addEventListener(ev, handle(ev) as EventListener)

    return () => {
      for (const ev of events) es.removeEventListener(ev, handle(ev) as EventListener)
      es.close()
    }
  }, [url, enabled])

  return { last, byType }
}
