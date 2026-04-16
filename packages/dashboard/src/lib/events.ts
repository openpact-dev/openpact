import type { SseEvent } from '../hooks/useSse'

type PactEventData = {
  pact_id?: string | null
  pactId?: string | null
  alias?: string | null
}

/**
 * SDK clients address a pact by alias (what the user sees) OR by its
 * 64-hex key. The daemon's SSE envelope carries BOTH `pact_id` (the
 * 64-hex canonical key) and `alias` (the local label). Match the
 * caller's identifier against either — otherwise a dashboard keyed on
 * the alias never sees any event (whose `pact_id` is the hex key) and
 * every trigger-driven refetch stops firing.
 */
function pactKeysFor(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const e = data as PactEventData
  const out: string[] = []
  if (typeof e.pact_id === 'string' && e.pact_id) out.push(e.pact_id.toLowerCase())
  if (typeof e.pactId === 'string' && e.pactId) out.push(e.pactId.toLowerCase())
  if (typeof e.alias === 'string' && e.alias) out.push(e.alias.toLowerCase())
  return out
}

export function eventBelongsToPact(
  event: SseEvent | undefined,
  pactId: string | null,
  allowedEvents?: readonly string[],
): boolean {
  if (!event || !pactId) return false
  if (allowedEvents && !allowedEvents.includes(event.event)) return false
  const needle = pactId.toLowerCase()
  return pactKeysFor(event.data).includes(needle)
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
