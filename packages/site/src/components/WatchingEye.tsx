interface Props {
  size?: number
  flicker?: boolean
}

/**
 * The watching eye — OpenPact's brand mark. Slit-pupil eye flanked by
 * horns with three agent nodes beneath. Ported from the dashboard.
 */
export function WatchingEye({ size = 32, flicker = true }: Props) {
  return (
    <span
      class={flicker ? 'animate-flicker' : ''}
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        color: 'var(--color-ember)',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <path
          d="M6 9C5 6 5.5 4 7 3.5c0.6 1.6 0.4 3.4-0.5 5.2"
          stroke="currentColor"
          stroke-width="1.1"
          stroke-linecap="round"
        />
        <path
          d="M26 9c1-3 0.5-5-1-5.5-0.6 1.6-0.4 3.4 0.5 5.2"
          stroke="currentColor"
          stroke-width="1.1"
          stroke-linecap="round"
        />
        <path
          d="M3 16C7 11 11 9 16 9s9 2 13 7c-4 5-8 7-13 7S7 21 3 16z"
          stroke="currentColor"
          stroke-width="1.15"
          stroke-linejoin="round"
        />
        <circle cx="16" cy="16" r="4.5" stroke="currentColor" stroke-width="1.1" />
        <ellipse cx="16" cy="16" rx="1" ry="4" fill="currentColor" />
        <circle cx="11" cy="26" r="1.4" fill="currentColor" />
        <circle cx="16" cy="28" r="1.4" fill="currentColor" />
        <circle cx="21" cy="26" r="1.4" fill="currentColor" />
        <path
          d="M11 26 L16 28 L21 26 L11 26"
          stroke="currentColor"
          stroke-width="0.6"
          opacity="0.6"
        />
      </svg>
    </span>
  )
}

interface CornerProps {
  pos: 'tl' | 'tr' | 'bl' | 'br'
  size?: number
}

const ROTATE: Record<CornerProps['pos'], number> = { tl: 0, tr: 90, br: 180, bl: 270 }
const POSITION: Record<CornerProps['pos'], preact.JSX.CSSProperties> = {
  tl: { top: -5, left: -5 },
  tr: { top: -5, right: -5 },
  br: { bottom: -5, right: -5 },
  bl: { bottom: -5, left: -5 },
}

export function CornerBracket({ pos, size = 14 }: CornerProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        ...POSITION[pos],
        width: size,
        height: size,
        transform: `rotate(${ROTATE[pos]}deg)`,
        color: 'var(--color-ember)',
        opacity: 0.85,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
        <path d="M0.5 7V0.5H7" stroke="currentColor" stroke-width="0.75" />
        <circle cx="0.5" cy="0.5" r="0.9" fill="currentColor" />
      </svg>
    </span>
  )
}
