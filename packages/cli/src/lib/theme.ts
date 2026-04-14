import pc from 'picocolors'

// ─── Palette ────────────────────────────────────────────────────────────────
// Red is the brand colour — it does the heavy lifting. Yellow/orange for
// caution. Dim grey for secondary text. Picocolors automatically respects
// NO_COLOR and non-TTY contexts, so callers don't have to think about it.

export const c = {
  brand: pc.red,
  brandBold: (s: string) => pc.red(pc.bold(s)),
  brandBg: (s: string) => pc.bgRed(pc.white(pc.bold(s))),
  ember: pc.yellow, // warnings, attention
  ash: pc.dim, // secondary, paths, hex keys
  bone: pc.white,
  spark: pc.green, // success-y signal where red would be confusing (rare)
} as const

// ─── Glyphs ────────────────────────────────────────────────────────────────
// Unicode only — no emoji. These render consistently across modern terminals
// (iTerm, Terminal.app, Alacritty, Wezterm, Windows Terminal) and copy/paste
// cleanly into docs. The vibe is alchemical / heraldic, not occult.

export const glyph = {
  flame: '🜏', // alchemical sulfur — brimstone, the OpenPact mark
  point: '▲', // ascending triangle — entry markers
  seal: '✦', // sparkle/seal — pact created/joined
  bind: '⚜', // fleur-de-lis — writer bound
  sever: '✗', // cross — writer severed
  bullet: '·',
  arrow: '›',
  rule: '─',
} as const

// ─── Banner ────────────────────────────────────────────────────────────────
// Shown once per session on `init` and `start --foreground`. Compact (5
// lines) so it doesn't dominate. Picocolors strips the colour codes when
// stdout isn't a TTY, so the text remains readable in logs and CI.

const HORIZ = glyph.rule.repeat(34)

export function banner(): string {
  return [
    '',
    `  ${c.brand(glyph.flame)}  ${c.brandBold('OpenPact')}  ${c.brand(glyph.flame)}`,
    `  ${c.ash(HORIZ)}`,
    `  ${c.ash('a pact among daemons')}`,
    '',
  ].join('\n')
}

// Small one-line wordmark for embedded contexts (e.g. status command headers).
export function mark(): string {
  return `${c.brand(glyph.flame)} ${c.brandBold('OpenPact')}`
}
