import { h } from 'preact'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/preact'
import { toast } from 'sonner'
import { PactContext } from '../../src/hooks/usePact'
import { SseProvider } from '../../src/hooks/useSse'
import { useActivityToasts } from '../../src/hooks/useActivityToasts'

vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

class FakeEventSource {
  url: string
  listeners = new Map<string, ((e: { data: string }) => void)[]>()
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    instances.push(this)
  }

  addEventListener(event: string, fn: (e: { data: string }) => void): void {
    const list = this.listeners.get(event) ?? []
    list.push(fn)
    this.listeners.set(event, list)
  }

  removeEventListener(event: string, fn: (e: { data: string }) => void): void {
    const list = this.listeners.get(event) ?? []
    this.listeners.set(
      event,
      list.filter((entry) => entry !== fn),
    )
  }

  close(): void {}

  dispatch(event: string, payload: unknown): void {
    for (const fn of this.listeners.get(event) ?? []) {
      fn({ data: JSON.stringify(payload) })
    }
  }
}

let instances: FakeEventSource[] = []

function Probe() {
  useActivityToasts(true)
  return null
}

const pact = {
  pactId: 'pact-a',
  status: async () => ({
    peer_handle: 'anon-self-1111',
    display_name: 'Self',
  }),
  peers: async () => [],
} as any

beforeEach(() => {
  instances = []
  ;(globalThis as any).EventSource = FakeEventSource
  vi.mocked(toast).mockReset()
})

afterEach(() => {
  delete (globalThis as any).EventSource
})

describe('useActivityToasts', () => {
  test('ignores events from other pacts', async () => {
    render(h(SseProvider, null, h(PactContext.Provider, { value: pact }, h(Probe, null))))

    await act(async () => {
      instances[0].dispatch('entry-applied', {
        pact_id: 'pact-b',
        kind: 'entry',
        entry: {
          type: 'knowledge',
          agent_id: 'anon-wolf-2222',
          display_name: 'Other',
          payload: { topic: 'foreign update' },
        },
      })
    })

    await waitFor(() => expect(vi.mocked(toast)).not.toHaveBeenCalled())
  })

  test('toasts same-pact public activity', async () => {
    render(h(SseProvider, null, h(PactContext.Provider, { value: pact }, h(Probe, null))))

    await act(async () => {
      instances[0].dispatch('entry-applied', {
        pact_id: 'pact-a',
        kind: 'entry',
        entry: {
          type: 'knowledge',
          agent_id: 'anon-wolf-2222',
          display_name: 'Other',
          payload: { topic: 'shared topic' },
        },
      })
    })

    await waitFor(() => expect(vi.mocked(toast)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toast)).toHaveBeenCalledWith('Other shared knowledge', {
      description: 'shared topic',
      duration: 4000,
    })
  })

  test('toasts same-pact messages — daemon emits kind:entry + entry.type', async () => {
    render(h(SseProvider, null, h(PactContext.Provider, { value: pact }, h(Probe, null))))

    await act(async () => {
      instances[0].dispatch('entry-applied', {
        pact_id: 'pact-a',
        kind: 'entry',
        entry: {
          type: 'message',
          agent_id: 'anon-wolf-2222',
          display_name: 'Other',
          payload: { content: 'hello from the other side' },
        },
      })
    })

    await waitFor(() => expect(vi.mocked(toast)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toast)).toHaveBeenCalledWith('Other sent a message', {
      description: 'hello from the other side',
      duration: 4000,
    })
  })
})
