/**
 * Decorative line-art used in panel corners and as section dividers.
 *
 * Engraved at hairline weight to match the codex aesthetic.
 */

interface CornerProps {
  /** Which corner: tl | tr | bl | br */
  pos: 'tl' | 'tr' | 'bl' | 'br'
  size?: number
}

const ROTATE: Record<CornerProps['pos'], number> = {
  tl: 0,
  tr: 90,
  br: 180,
  bl: 270,
}

const POSITION: Record<CornerProps['pos'], preact.JSX.CSSProperties> = {
  tl: { top: -5, left: -5 },
  tr: { top: -5, right: -5 },
  br: { bottom: -5, right: -5 },
  bl: { bottom: -5, left: -5 },
}

/**
 * A small bracket — three short hairlines forming an open corner.
 * Sits absolutely positioned inside a `relative` parent.
 */
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

/**
 * Decorative section divider — a hairline interrupted by a small
 * ember-coloured medallion at the centre.
 */
export function MedallionRule({ class: cls = '' }: { class?: string } = {}) {
  return (
    <div class={`relative my-6 flex items-center ${cls}`} aria-hidden="true">
      <div class="hairline flex-1" />
      <span class="mx-3 inline-flex items-center">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6.25" stroke="var(--color-line)" stroke-width="0.75" />
          <path
            d="M7 1.5v3M7 9.5v3M1.5 7h3M9.5 7h3"
            stroke="var(--color-line)"
            stroke-width="0.75"
          />
          <circle cx="7" cy="7" r="1.5" fill="var(--color-ember)" />
        </svg>
      </span>
      <div class="hairline flex-1" />
    </div>
  )
}

/**
 * The watching eye — a more detailed version of the sigil with the
 * ember glow. Used in the sidebar header.
 */
export function WatchingEye({ size = 30 }: { size?: number }) {
  return (
    <span
      class="animate-flicker"
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        color: 'var(--color-ember)',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        {/* horns */}
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
        {/* eye almond */}
        <path
          d="M3 16C7 11 11 9 16 9s9 2 13 7c-4 5-8 7-13 7S7 21 3 16z"
          stroke="currentColor"
          stroke-width="1.15"
          stroke-linejoin="round"
        />
        {/* iris ring */}
        <circle cx="16" cy="16" r="4.5" stroke="currentColor" stroke-width="1.1" />
        {/* slit pupil */}
        <ellipse cx="16" cy="16" rx="1" ry="4" fill="currentColor" />
        {/* three agent nodes beneath */}
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
