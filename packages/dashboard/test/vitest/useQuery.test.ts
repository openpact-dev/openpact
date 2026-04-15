/**
 * useQuery: in-flight dedupe, error surfacing, refetch on trigger
 * change. Runs under jsdom via vitest.
 */
import { describe, expect, test, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/preact'
import { useQuery, _resetUseQueryCache } from '../../src/hooks/useQuery'

beforeEach(() => {
  _resetUseQueryCache()
})

describe('useQuery', () => {
  test('resolves and exposes data, loading false', async () => {
    const fn = async () => 42
    const { result } = renderHook(() => useQuery(fn, { key: 'k1' }))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe(42)
    expect(result.current.error).toBeUndefined()
  })

  test('surfaces thrown errors', async () => {
    const fn = async () => {
      throw new Error('boom')
    }
    const { result } = renderHook(() => useQuery<number>(fn, { key: 'k2' }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.message).toBe('boom')
    expect(result.current.data).toBeUndefined()
  })

  test('two hooks with the same key share one in-flight call (dedupe)', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return calls
    }
    const a = renderHook(() => useQuery(fn, { key: 'k3' }))
    const b = renderHook(() => useQuery(fn, { key: 'k3' }))
    await waitFor(() => expect(a.result.current.loading).toBe(false))
    await waitFor(() => expect(b.result.current.loading).toBe(false))
    expect(calls).toBe(1)
    expect(a.result.current.data).toBe(1)
    expect(b.result.current.data).toBe(1)
  })

  test('refetch() bumps the cache key and re-runs', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return calls
    }
    const { result } = renderHook(() => useQuery(fn, { key: 'k4' }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(calls).toBe(1)
    await act(async () => {
      result.current.refetch()
    })
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(calls).toBe(2)
  })

  test('changing trigger re-runs the fetch', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return calls
    }
    let trigger = 0
    const { result, rerender } = renderHook(() => useQuery(fn, { key: 'k5', trigger }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    trigger = 1
    rerender()
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(calls).toBe(2)
  })
})
