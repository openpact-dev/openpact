import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

export interface QueryState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  /** True when the latest fetch failed but an older value is still available. */
  stale: boolean
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

  // Cache by `key` alone. `trigger` and `version` both *invalidate* by
  // re-running the effect, but neither belongs in the cache key —
  // including them would mean every SSE-driven trigger bump misses the
  // cache, which loses the prior settled value and forces the UI to
  // render with `data: undefined` until the new fetch resolves. The
  // visible symptom was a "whole page reload" flash on every event.
  // Stale-while-revalidate only works when the cache lookup hits.
  const cacheKey = key

  const [state, setState] = useState<{
    data: T | undefined
    error: Error | undefined
    loading: boolean
    stale: boolean
  }>({
    data: undefined,
    error: undefined,
    loading: true,
    stale: false,
  })

  useEffect(() => {
    let cancelled = false

    let entry = cache.get(cacheKey) as CacheEntry<T> | undefined
    const settled = !!entry && (entry.value !== undefined || entry.error !== undefined)
    let justKicked = false
    if (!entry || settled) {
      // Miss, or cache hit with an already-resolved value — either way,
      // kick a fresh fetch. Stale-while-revalidate: we still paint the
      // previous value immediately so the UI isn't blank, but a new
      // mount cannot silently serve data from a previous navigation.
      // An in-flight entry (settled===false) short-circuits here so two
      // components asking for the same key dedupe on the same promise.
      const previousValue = entry?.value
      const promise = (async () => fnRef.current())()
      entry = { promise, value: previousValue, error: undefined }
      cache.set(cacheKey, entry as CacheEntry<unknown>)
      promise
        .then((v) => {
          entry!.value = v
        })
        .catch((e: unknown) => {
          entry!.error = e instanceof Error ? e : new Error(String(e))
        })
      justKicked = true
    }

    // While a new fetch is in flight we're always loading. Previous
    // value stays painted so refetches don't flash empty; error slot
    // is cleared now and re-populated by .catch if the fetch fails.
    setState({
      data: entry.value,
      error: justKicked ? undefined : entry.error,
      loading: justKicked || entry.value === undefined,
      stale: false,
    })

    const pendingEntry = entry
    pendingEntry.promise
      .then((v) => {
        if (cancelled) return
        setState({ data: v, error: undefined, loading: false, stale: false })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({
          data: pendingEntry.value,
          error: e instanceof Error ? e : new Error(String(e)),
          loading: false,
          stale: pendingEntry.value !== undefined,
        })
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, trigger, version])

  return useMemo(() => ({ ...state, refetch }), [state])
}

/** Test-only escape hatch. Keeps the cache from leaking between Vitest tests. */
export function _resetUseQueryCache(): void {
  cache.clear()
}
