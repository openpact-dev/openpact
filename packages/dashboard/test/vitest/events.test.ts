import { describe, expect, test } from 'vitest'
import type { SseEvent } from '../../src/hooks/useSse'
import { eventBelongsToPact, eventSeqForPact } from '../../src/lib/events'

function ev(partial: Partial<SseEvent> & { event: string; data?: unknown }): SseEvent {
  return { seq: 1, data: null, ...partial }
}

describe('eventBelongsToPact', () => {
  test('matches when the caller passes the pact alias and the frame carries it', () => {
    const e = ev({ event: 'entry-applied', data: { alias: 'the-raven-seal', pact_id: 'abcd' } })
    expect(eventBelongsToPact(e, 'the-raven-seal')).toBe(true)
  })

  test('matches when the caller passes the 64-hex pact key', () => {
    const e = ev({ event: 'entry-applied', data: { alias: 'the-raven-seal', pact_id: 'ABCD' } })
    expect(eventBelongsToPact(e, 'abcd')).toBe(true)
  })

  test('matches the camelCase pactId key emitted internally', () => {
    const e = ev({ event: 'update', data: { pactId: 'ABCD', alias: 'a' } })
    expect(eventBelongsToPact(e, 'abcd')).toBe(true)
  })

  test('is case-insensitive for both sides', () => {
    const e = ev({ event: 'update', data: { alias: 'THE-PACT' } })
    expect(eventBelongsToPact(e, 'the-pact')).toBe(true)
    expect(eventBelongsToPact(e, 'the-PACT')).toBe(true)
  })

  test('does not match a different pact', () => {
    const e = ev({ event: 'entry-applied', data: { alias: 'the-raven-seal', pact_id: 'abcd' } })
    expect(eventBelongsToPact(e, 'other-pact')).toBe(false)
  })

  test('returns false without a pactId to compare against', () => {
    const e = ev({ event: 'entry-applied', data: { alias: 'x' } })
    expect(eventBelongsToPact(e, null)).toBe(false)
  })

  test('filters by allowed event types', () => {
    const e = ev({ event: 'invalid-entry', data: { alias: 'p1' } })
    expect(eventBelongsToPact(e, 'p1', ['entry-applied'])).toBe(false)
    expect(eventBelongsToPact(e, 'p1', ['entry-applied', 'invalid-entry'])).toBe(true)
  })

  test('rejects frames without pact identifiers', () => {
    const e = ev({ event: 'peer-add', data: { remoteKey: 'ff' } })
    expect(eventBelongsToPact(e, 'p1')).toBe(false)
  })
})

describe('eventSeqForPact', () => {
  test('returns the seq when the event belongs to the pact', () => {
    const e = ev({ event: 'entry-applied', seq: 17, data: { alias: 'p1' } })
    expect(eventSeqForPact(e, 'p1')).toBe(17)
  })

  test('returns 0 when the event is for a different pact', () => {
    const e = ev({ event: 'entry-applied', seq: 17, data: { alias: 'p2' } })
    expect(eventSeqForPact(e, 'p1')).toBe(0)
  })

  test('returns 0 when the event type is not in the allowed list', () => {
    const e = ev({ event: 'peer-add', seq: 17, data: { alias: 'p1' } })
    expect(eventSeqForPact(e, 'p1', ['entry-applied'])).toBe(0)
  })

  test('returns 0 when there is no event', () => {
    expect(eventSeqForPact(undefined, 'p1')).toBe(0)
  })
})
