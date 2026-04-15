import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

export interface QueryState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  refetch: () => void
}

interface QueryOpts {
  /**
   * Cache key for in-flight dedupe. Two components calling `useQuery`
   * with the same key share the same fetch promise.
   */
  key: string
  /**
   * Refetch when this number changes. Bump it from a parent (or via
   * SSE) to force a refresh.
   */
  trigger?: number
}

interface CacheEntry<T> {
  promise: Promise<T>
  // Last resolved value (kept across refetches so consumers can render
  // stale data while loading the next page).
  value: T | undefined
  error: Error | undefined
}

const cache = new Map<string, CacheEntry<unknown>>()

/**
 * Run an SDK call, return { data, error, loading, refetch }. Two
 * components asking for the same `key` share one in-flight promise
 * (in-flight dedupe). After resolution the value sits in cache until
 * the next `refetch` (or `trigger` change).
 *
 * No external state lib; no global cache invalidation. Components that
 * care about freshness pass a `trigger` from a parent SSE listener.
 */
export function useQuery<T>(fn: () => Promise<T>, opts: QueryOpts): QueryState<T> {
  const { key, trigger = 0 } = opts
  const [version, setVersion] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const refetch = () => setVersion((v) => v + 1)

  // Re-run when the cache key, the external trigger, or refetch counter changes.
  const cacheKey = `${key}::${trigger}::${version}`

  const [state, setState] = useState<{
    data: T | undefined
    error: Error | undefined
    loading: boolean
  }>({
    data: undefined,
    error: undefined,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    let entry = cache.get(cacheKey) as CacheEntry<T> | undefined
    if (!entry) {
      const promise = (async () => fnRef.current())()
      entry = { promise, value: undefined, error: undefined }
      cache.set(cacheKey, entry as CacheEntry<unknown>)
      promise
        .then((v) => {
          entry!.value = v
        })
        .catch((e: unknown) => {
          entry!.error = e instanceof Error ? e : new Error(String(e))
        })
    }

    setState({ data: entry.value, error: entry.error, loading: !entry.value && !entry.error })

    entry.promise
      .then((v) => {
        if (cancelled) return
        setState({ data: v, error: undefined, loading: false })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({
          data: undefined,
          error: e instanceof Error ? e : new Error(String(e)),
          loading: false,
        })
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey])

  return useMemo(() => ({ ...state, refetch }), [state])
}

/** Test-only escape hatch. Keeps the cache from leaking between Vitest tests. */
export function _resetUseQueryCache(): void {
  cache.clear()
}
