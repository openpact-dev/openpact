import pc from 'picocolors'

// ─── Palette ────────────────────────────────────────────────────────────────
// Red carries the brand. Yellow for caution. Dim grey for secondary text.
// Picocolors handles NO_COLOR and non-TTY automatically.

export const c = {
  brand: pc.red,
  brandBold: (s: string) => pc.red(pc.bold(s)),
  brandBg: (s: string) => pc.bgRed(pc.white(pc.bold(s))),
  ember: pc.yellow,
  ash: pc.dim,
  bone: pc.white,
  spark: pc.green,
} as const

// ─── Emoji (sparing) ────────────────────────────────────────────────────────
// One per "moment" — not on every line. Real emojis, not unicode glyphs:
// the brand has a devilish edge and the colour adds punch.

export const emoji = {
  brand: '😈', // OpenPact mark; banner / status / errors
  flame: '🔥', // start / summon
  bones: '💀', // stop / banish
  bind: '⚜️', // add-writer
  sever: '💔', // remove-writer
  cross: '❌', // hard error
} as const

// ─── ASCII art ─────────────────────────────────────────────────────────────
// Used only for the headline moments: --help, init, start (foreground), stop.
// Six lines max. Designed to read in red on a dark terminal but plain enough
// to survive in logs and pasted into docs.

const WORDMARK = [
  '   ___                  ____           _   ',
  '  / _ \\ _ __   ___ _ _ |  _ \\ __ _  __| |_ ',
  " | | | | '_ \\ / _ \\ '_ \\| |_) / _` |/ _| __|",
  ' | |_| | |_) |  __/ | | |  __/ (_| | (__| |_ ',
  '  \\___/| .__/ \\___|_| |_|_|   \\__,_|\\___|\\__|',
  '       |_|                                   ',
]

const TAGLINE = '  a pact among daemons'

export function banner(): string {
  const wordmark = WORDMARK.map((line) => '  ' + c.brand(line)).join('\n')
  return ['', wordmark, '', `${c.ash(TAGLINE)}`, ''].join('\n')
}

// Tiny inline wordmark for places where the full banner would dominate
// (status header, log header).
export function mark(): string {
  return `${emoji.brand} ${c.brandBold('OpenPact')}`
}

// ASCII for stop — a horns-down-and-fading shape. Three lines.
const ASHES = [
  '    .   ,   .   ,   .   ,   .',
  '       . the daemon fades .   ',
  '    ,   .   ,   .   ,   .   ,',
]

export function ashes(): string {
  return ASHES.map((line) => c.ash(line)).join('\n')
}
