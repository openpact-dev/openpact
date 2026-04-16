/**
 * useSse: subscribe, parse JSON frames, expose latest event by type.
 *
 * jsdom doesn't ship EventSource, so we install a fake on globalThis
 * before the hook mounts. The fake captures listeners + lets us
 * dispatch synthetic events.
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/preact'
import { useSse } from '../../src/hooks/useSse'

class FakeEventSource {
  url: string
  listeners: Map<string, ((e: any) => void)[]> = new Map()
  closed = false
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    instances.push(this)
  }

  addEventListener(event: string, fn: (e: any) => void): void {
    const list = this.listeners.get(event) ?? []
    list.push(fn)
    this.listeners.set(event, list)
  }

  removeEventListener(event: string, fn: (e: any) => void): void {
    const list = this.listeners.get(event) ?? []
    this.listeners.set(
      event,
      list.filter((f) => f !== fn),
    )
  }

  close(): void {
    this.closed = true
  }

  open(): void {
    this.onopen?.()
  }

  fail(): void {
    this.onerror?.()
  }

  dispatch(event: string, data: string): void {
    for (const fn of this.listeners.get(event) ?? []) fn({ data })
  }
}

let instances: FakeEventSource[] = []

beforeEach(() => {
  instances = []
  ;(globalThis as any).EventSource = FakeEventSource
})

afterEach(() => {
  delete (globalThis as any).EventSource
})

describe('useSse', () => {
  test('opens an EventSource at the given URL', () => {
    renderHook(() => useSse({ url: '/api/events' }))
    expect(instances.length).toBe(1)
    expect(instances[0].url).toBe('/api/events')
  })

  test('parses JSON event frames and exposes latest by type', async () => {
    const { result } = renderHook(() => useSse({ url: '/api/events' }))
    await act(async () => {
      instances[0].open()
    })
    await act(async () => {
      instances[0].dispatch(
        'entry-applied',
        JSON.stringify({ entry: { id: 'a-1', payload: { content: 'hi' } } }),
      )
    })
    await waitFor(() => expect(result.current.last?.event).toBe('entry-applied'))
    expect((result.current.byType['entry-applied'].data as any).entry.id).toBe('a-1')
    expect(result.current.connected).toBe(true)
    expect(result.current.reconnecting).toBe(false)
    expect(result.current.error).toBeUndefined()
    expect(result.current.lastEventAt).toBeTypeOf('number')
  })

  test('seq monotonically increments per event', async () => {
    const { result } = renderHook(() => useSse({ url: '/api/events' }))
    await act(async () => {
      instances[0].open()
    })
    await act(async () => {
      instances[0].dispatch('peer-add', JSON.stringify({ remoteKey: 'k1' }))
    })
    await waitFor(() => expect(result.current.last?.seq).toBe(1))
    await act(async () => {
      instances[0].dispatch('peer-remove', JSON.stringify({ remoteKey: 'k1' }))
    })
    await waitFor(() => expect(result.current.last?.seq).toBe(2))
  })

  test('tracks reconnecting state after a disconnect', async () => {
    const { result } = renderHook(() => useSse({ url: '/api/events' }))
    await act(async () => {
      instances[0].open()
    })
    await waitFor(() => expect(result.current.connected).toBe(true))
    await act(async () => {
      instances[0].fail()
    })
    await waitFor(() => expect(result.current.connected).toBe(false))
    expect(result.current.reconnecting).toBe(true)
    expect(result.current.error?.message).toMatch(/reconnecting/i)
  })

  test('disabled: does not open a connection', () => {
    renderHook(() => useSse({ url: '/api/events', enabled: false }))
    expect(instances.length).toBe(0)
  })

  test('cleans up exact listeners on unmount', () => {
    const { unmount } = renderHook(() => useSse({ url: '/api/events' }))
    const before = Array.from(instances[0].listeners.values()).reduce(
      (sum, list) => sum + list.length,
      0,
    )
    expect(before).toBeGreaterThan(0)
    expect(instances[0].closed).toBe(false)
    unmount()
    expect(instances[0].closed).toBe(true)
    const after = Array.from(instances[0].listeners.values()).reduce(
      (sum, list) => sum + list.length,
      0,
    )
    expect(after).toBe(0)
  })
})
