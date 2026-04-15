/**
 * Sigil — type-coded glyph for each entry kind.
 *
 * Engraved-line aesthetic; meant to read at 14–22px. Each glyph picks
 * up the type's hue from CSS custom properties (sigil-knowledge,
 * sigil-task, sigil-skill, sigil-message), so the same component
 * works on parchment and on the forge.
 *
 * The set:
 *   - knowledge → an eye with a slit pupil (the daemon, watching)
 *   - task      → crossed daggers (a binding)
 *   - skill     → a small key (a learned rite)
 *   - message   → a comet (a sent signal)
 */

export type SigilKind = 'knowledge' | 'task' | 'skill' | 'message'

interface Props {
  kind: SigilKind
  size?: number
  /** When true, draws a faint disk behind the glyph in the type's soft hue. */
  bordered?: boolean
}

const COLOR: Record<SigilKind, string> = {
  knowledge: 'var(--color-sigil-knowledge)',
  task: 'var(--color-sigil-task)',
  skill: 'var(--color-sigil-skill)',
  message: 'var(--color-sigil-message)',
}

const SOFT: Record<SigilKind, string> = {
  knowledge: 'var(--color-sigil-knowledge-soft)',
  task: 'var(--color-sigil-task-soft)',
  skill: 'var(--color-sigil-skill-soft)',
  message: 'var(--color-sigil-message-soft)',
}

export function Sigil({ kind, size = 18, bordered = false }: Props) {
  const stroke = COLOR[kind]
  const bg = SOFT[kind]
  const wrap: preact.JSX.CSSProperties = bordered
    ? {
        width: size + 10,
        height: size + 10,
        borderRadius: '50%',
        background: bg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px var(--color-line)',
      }
    : { display: 'inline-flex', width: size, height: size }

  return (
    <span style={wrap} aria-hidden="true">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        {kind === 'knowledge' && (
          <>
            {/* Eye outline + slit pupil */}
            <path d="M2.5 12C5 7.5 8.5 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-6 6.5-9.5 6.5S5 16.5 2.5 12z" />
            <ellipse cx="12" cy="12" rx="1" ry="3.6" fill={stroke} stroke="none" />
            <circle cx="12" cy="12" r="3.5" />
          </>
        )}
        {kind === 'task' && (
          <>
            {/* Crossed daggers (binding) */}
            <path d="M7 4l10 16M17 4L7 20" />
            <path d="M5.5 4h3M15.5 4h3M5.5 20h3M15.5 20h3" />
            <circle cx="12" cy="12" r="1.6" />
          </>
        )}
        {kind === 'skill' && (
          <>
            {/* Skeleton key */}
            <circle cx="7.5" cy="12" r="3.5" />
            <path d="M11 12h10M18 12v3M15 12v2.2" />
            <circle cx="7.5" cy="12" r="1" fill={stroke} stroke="none" />
          </>
        )}
        {kind === 'message' && (
          <>
            {/* Comet — a head with a curving tail */}
            <circle cx="17" cy="7" r="2.6" />
            <path d="M15.4 8.6 4 20" />
            <path d="M6.5 14.5 4 20l5.5-2.5" />
          </>
        )}
      </svg>
    </span>
  )
}
