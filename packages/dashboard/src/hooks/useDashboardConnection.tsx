import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks'
import { hostClient } from '../lib/client'
import { useSharedSse } from './useSse'

export interface DashboardConnectionState {
  daemonReachable: boolean | null
  checking: boolean
  error: Error | undefined
  lastCheckedAt: number | undefined
  sseConnected: boolean
  sseReconnecting: boolean
  sseError: Error | undefined
}

const DashboardConnectionContext = createContext<DashboardConnectionState | null>(null)

function useDashboardConnectionValue(): DashboardConnectionState {
  const sse = useSharedSse()
  const [daemonReachable, setDaemonReachable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | undefined>(undefined)

  const probe = useCallback(async () => {
    setChecking(true)
    try {
      await hostClient.ping()
      setDaemonReachable(true)
      setError(undefined)
      setLastCheckedAt(Date.now())
    } catch (e: unknown) {
      setDaemonReachable(false)
      setError(e instanceof Error ? e : new Error(String(e)))
      setLastCheckedAt(Date.now())
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void probe()
  }, [probe])

  useEffect(() => {
    if (!sse.connected) return
    setDaemonReachable(true)
    setChecking(false)
    setError(undefined)
    setLastCheckedAt(Date.now())
  }, [sse.connected])

  useEffect(() => {
    if (!sse.reconnecting && !sse.error) return
    void probe()
    const id = window.setInterval(() => {
      void probe()
    }, 2000)
    return () => window.clearInterval(id)
  }, [sse.reconnecting, sse.error, probe])

  return useMemo(
    () => ({
      daemonReachable,
      checking,
      error,
      lastCheckedAt,
      sseConnected: sse.connected,
      sseReconnecting: sse.reconnecting,
      sseError: sse.error,
    }),
    [daemonReachable, checking, error, lastCheckedAt, sse.connected, sse.reconnecting, sse.error],
  )
}

export function DashboardConnectionProvider({ children }: { children: ComponentChildren }) {
  const value = useDashboardConnectionValue()
  return (
    <DashboardConnectionContext.Provider value={value}>
      {children}
    </DashboardConnectionContext.Provider>
  )
}

export function useDashboardConnection(): DashboardConnectionState {
  const value = useContext(DashboardConnectionContext)
  if (!value) {
    throw new Error('useDashboardConnection must be used inside <DashboardConnectionProvider>.')
  }
  return value
}
