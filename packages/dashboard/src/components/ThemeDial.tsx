import { useTheme, type ThemePreference } from '../hooks/useTheme'

/**
 * Three-position dial — System / Light / Dark.
 *
 * Visually: a small brass-engraved control. The active position
 * carries an ember dot; the others are hairline-only. Click any to
 * set it. Default = System (defers to OS).
 */
const POSITIONS: ThemePreference[] = ['light', 'system', 'dark']

const LABEL: Record<ThemePreference, string> = {
  light: 'Light',
  system: 'System',
  dark: 'Dark',
}

const ICON: Record<ThemePreference, preact.JSX.Element> = {
  light: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="2.4" stroke="currentColor" stroke-width="0.9" />
      <path
        d="M6 1v1.5M6 9.5V11M11 6H9.5M2.5 6H1M9.5 2.5L8.5 3.5M3.5 8.5L2.5 9.5M9.5 9.5L8.5 8.5M3.5 3.5L2.5 2.5"
        stroke="currentColor"
        stroke-width="0.9"
        stroke-linecap="round"
      />
    </svg>
  ),
  system: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="2.5" width="9" height="6" rx="1" stroke="currentColor" stroke-width="0.9" />
      <path d="M4.5 10.5h3" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" />
    </svg>
  ),
  dark: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path
        d="M9.5 6.8a4 4 0 1 1-4.6-4.7 3.2 3.2 0 0 0 4.6 4.7z"
        stroke="currentColor"
        stroke-width="0.9"
        stroke-linejoin="round"
      />
    </svg>
  ),
}

export function ThemeDial() {
  const { preference, setPreference } = useTheme()

  return (
    <div
      class="relative flex items-stretch overflow-hidden rounded-[3px] border border-[var(--color-line)] bg-[var(--color-canvas)]"
      role="radiogroup"
      aria-label="Theme dial"
    >
      {POSITIONS.map((p, i) => {
        const active = preference === p
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LABEL[p]}
            title={LABEL[p]}
            onClick={() => setPreference(p)}
            class={`relative flex h-7 w-9 items-center justify-center transition-colors ${
              active
                ? 'bg-[var(--color-paper)] text-[var(--color-ember)]'
                : 'text-[var(--color-ink3)] hover:text-[var(--color-ink)]'
            } ${i > 0 ? 'border-l border-[var(--color-line)]' : ''}`}
            data-testid={`theme-${p}`}
          >
            {ICON[p]}
            {active ? (
              <span
                aria-hidden="true"
                class="absolute -bottom-px left-1/2 h-px w-3 -translate-x-1/2 bg-[var(--color-ember)]"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
