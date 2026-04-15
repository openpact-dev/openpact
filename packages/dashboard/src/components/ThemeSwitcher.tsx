import { useTheme, type ThemePreference } from '../hooks/useTheme'

const OPTIONS: { value: ThemePreference; label: string; icon: preact.JSX.Element }[] = [
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2" />
        <path d="M6 14h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.2" />
        <path
          d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M13 9.3A5.5 5.5 0 1 1 6.7 3a4.5 4.5 0 0 0 6.3 6.3z"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      </svg>
    ),
  },
]

/**
 * Three-button toggle: System / Light / Dark. The `system` choice
 * follows the OS-level preference live (see useTheme).
 *
 * Lives in the sidebar footer; minimal chrome by design.
 */
export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme()
  return (
    <div
      class="flex items-center gap-0.5 rounded-md border-[0.5px] border-line bg-canvas p-0.5"
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map((o) => {
        const active = preference === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => setPreference(o.value)}
            class={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              active ? 'bg-paper text-ink shadow-sm' : 'text-ink3 hover:text-ink'
            }`}
            data-testid={`theme-${o.value}`}
          >
            <span class="inline-flex h-3.5 w-3.5">{o.icon}</span>
          </button>
        )
      })}
    </div>
  )
}
