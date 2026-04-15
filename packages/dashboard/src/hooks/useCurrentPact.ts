import { useCallback, useEffect, useState } from 'preact/hooks'
import { hostClient } from '../lib/client'

const STORAGE_KEY = 'openpact:current-pact'

interface PactSnapshot {
  alias: string
  pact_id: string
  pact_name: string | null
  pact_purpose: string | null
  display_name: string | null
  role: string | null
  is_current: boolean
  added_at: string
}

interface UseCurrentPactResult {
  /** Currently-selected pact alias, or null while loading. */
  current: string | null
  /** Full registry list (sorted by added_at). */
  pacts: PactSnapshot[]
  /** Switch the dashboard to a different pact. Persists in localStorage and pushes to the daemon. */
  setCurrent: (alias: string) => Promise<void>
  /** Re-fetch the registry. */
  refresh: () => Promise<void>
  loading: boolean
  error: Error | null
}

/**
 * Tracks the dashboard's "current" pact. On first load, reads
 * localStorage; falls back to the daemon's currentAlias. Switching
 * persists locally + tells the daemon (so CLI commands stay in sync
 * with what the dashboard is showing).
 *
 * Resources should be re-keyed by `current` so caches invalidate on
 * a switch (`useQuery` keys include the pactId already).
 */
export function useCurrentPact(): UseCurrentPactResult {
  const [current, setCurrentState] = useState<string | null>(null)
  const [pacts, setPacts] = useState<PactSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await hostClient.pacts.list()
      setPacts(list.pacts)
      const localPref = readLocal()
      // Use localStorage if it points at a pact that still exists;
      // otherwise fall through to the daemon's currentAlias.
      const valid = localPref && list.pacts.some((p) => p.alias === localPref)
      setCurrentState(valid ? localPref : (list.current ?? list.pacts[0]?.alias ?? null))
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setCurrent = useCallback(
    async (alias: string) => {
      writeLocal(alias)
      setCurrentState(alias)
      // Best-effort sync to the daemon — failure here is non-fatal
      // (the dashboard still uses the local choice).
      try {
        await hostClient.pacts.switch(alias)
      } catch {
        /* ignore */
      }
      await refresh()
    },
    [refresh],
  )

  return { current, pacts, setCurrent, refresh, loading, error }
}

function readLocal(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeLocal(alias: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, alias)
  } catch {
    /* private mode etc. */
  }
}
