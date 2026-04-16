import type { SseEvent } from '../hooks/useSse'

type PactEventData = {
  pact_id?: string | null
  pactId?: string | null
}

function readPactId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const event = data as PactEventData
  if (typeof event.pact_id === 'string' && event.pact_id) return event.pact_id
  if (typeof event.pactId === 'string' && event.pactId) return event.pactId
  return null
}

export function eventBelongsToPact(
  event: SseEvent | undefined,
  pactId: string | null,
  allowedEvents?: readonly string[],
): boolean {
  if (!event || !pactId) return false
  if (allowedEvents && !allowedEvents.includes(event.event)) return false
  return readPactId(event.data) === pactId
}

export function eventSeqForPact(
  event: SseEvent | undefined,
  pactId: string | null,
  allowedEvents?: readonly string[],
): number {
  if (!event) return 0
  if (!eventBelongsToPact(event, pactId, allowedEvents)) return 0
  return event.seq
}
