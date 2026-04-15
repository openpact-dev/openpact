import { useEffect, useState } from 'preact/hooks'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'openpact:theme'

function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage?.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.classList.toggle('dark', resolved === 'dark')
  html.classList.toggle('light', resolved === 'light')
  html.style.colorScheme = resolved
}

/**
 * Theme hook. Tracks the user's preference (system / light / dark),
 * resolves to a concrete light or dark, and writes the corresponding
 * class to <html> so Tailwind's dark variant + the CSS custom-property
 * overrides in style.css pick it up.
 *
 * Defaults to `system`; respects `prefers-color-scheme` and follows
 * OS-level changes live when in system mode.
 */
export function useTheme(): {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (next: ThemePreference) => void
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const pref = readPreference()
    if (pref === 'dark') return 'dark'
    if (pref === 'light') return 'light'
    return systemPrefersDark() ? 'dark' : 'light'
  })

  useEffect(() => {
    let next: ResolvedTheme
    if (preference === 'dark') next = 'dark'
    else if (preference === 'light') next = 'light'
    else next = systemPrefersDark() ? 'dark' : 'light'
    setResolved(next)
    applyTheme(next)
  }, [preference])

  // Live-follow OS changes when in system mode.
  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? 'dark' : 'light'
      setResolved(next)
      applyTheme(next)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preference])

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.setItem(STORAGE_KEY, next)
      } catch {
        /* localStorage may be blocked; ignore */
      }
    }
  }

  return { preference, resolved, setPreference }
}

/**
 * Bootstrap script — called from index.tsx before render so the page
 * paints with the right theme immediately (no flash).
 */
export function applyInitialTheme(): ResolvedTheme {
  const pref = readPreference()
  const resolved: ResolvedTheme =
    pref === 'dark' ? 'dark' : pref === 'light' ? 'light' : systemPrefersDark() ? 'dark' : 'light'
  applyTheme(resolved)
  return resolved
}
