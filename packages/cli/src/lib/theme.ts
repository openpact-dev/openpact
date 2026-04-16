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
// The demonic flourish above the block wordmark is load-bearing brand —
// two halves of the same sigil, not a header + subheader.

const WORDMARK = `                     .                                                      .
                  .n                   .                 .                  n.
            .   .dP                  dP                   9b                 9b.    .
           4    qXb         .       dX                     Xb       .        dXp     t
          dX.    9Xb      .dXb    __                         __    dXb.     dXP     .Xb
          9XXb._       _.dXXXXb dXXXXbo.                 .odXXXXb dXXXXb._       _.dXXP
           9XXXXXXXXXXXXXXXXXXXVXXXXXXXXOo.           .oOXXXXXXXXVXXXXXXXXXXXXXXXXXXXP
            \`9XXXXXXXXXXXXXXXXXXXXX'~   ~\`OOO8b   d8OOO'~   ~\`XXXXXXXXXXXXXXXXXXXXXP'
              \`9XXXXXXXXXXXP' \`9XX'        \`98v8P8v89'        \`XXP' \`9XXXXXXXXXXXP'
                  ~~~~~~~       9X.          .db|db.          .XP       ~~~~~~~
                                 )b.  .dbo.dP'\`v'\`9b.odb.  .dX(
                               ,dXXXXXXXXXXXb     dXXXXXXXXXXXb.
                              dXXXXXXXXXXXP'   .   \`9XXXXXXXXXXXb
                             dXXXXXXXXXXXXb   d|b   dXXXXXXXXXXXXb
                             9XXb'   \`XXXXXb.dX|Xb.dXXXXX'   \`dXXP
                              \`'      9XXXXXX(   )XXXXXXP      \`'
                                       XXXX X.\`v'.X XXXX
                                       XP^X'\`b   d'\`X^XX
                                       X. 9  \`   '  P )X
                                       \`b  \`       '  d'
                                        \`             '

         ██████╗ ██████╗ ███████╗███╗   ██╗██████╗  █████╗  ██████╗████████╗
        ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
        ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██████╔╝███████║██║        ██║
        ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██╔═══╝ ██╔══██║██║        ██║
        ╚██████╔╝██║     ███████╗██║ ╚████║██║     ██║  ██║╚██████╗   ██║
         ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝`.split('\n')

const TAGLINE = '  P2P shared memory for software agents'

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
