import { useTheme } from '../hooks/useTheme'

/**
 * Single-button theme toggle.
 *
 * Flips between light and dark. First click from `system` picks the
 * opposite of whatever the OS resolved to, so the visible state always
 * changes. Icon shows the theme you'd switch to.
 */
const SUN = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="2.8" stroke="currentColor" stroke-width="1" />
    <path
      d="M7 1.2v1.6M7 11.2v1.6M12.8 7h-1.6M2.8 7H1.2M11.1 2.9l-1.1 1.1M4 10l-1.1 1.1M11.1 11.1L10 10M4 4 2.9 2.9"
      stroke="currentColor"
      stroke-width="1"
      stroke-linecap="round"
    />
  </svg>
)

const MOON = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M11 7.9a4.7 4.7 0 1 1-5.4-5.5 3.8 3.8 0 0 0 5.4 5.5z"
      stroke="currentColor"
      stroke-width="1"
      stroke-linejoin="round"
    />
  </svg>
)

export function ThemeDial() {
  const { resolved, setPreference } = useTheme()
  const isDark = resolved === 'dark'
  const nextLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      type="button"
      onClick={() => setPreference(isDark ? 'light' : 'dark')}
      aria-label={nextLabel}
      title={nextLabel}
      data-testid="theme-toggle"
      class="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-ink2)] transition-colors hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
    >
      {isDark ? SUN : MOON}
    </button>
  )
}
