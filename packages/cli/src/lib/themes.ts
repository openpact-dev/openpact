import { randomInt } from 'crypto'

/**
 * Themed defaults for interactive init/join. These back the
 * `openpact init` prompts so hitting enter gives something that
 * fits the brand voice instead of `anon-krait-7f2d9999`-style filler.
 *
 * They are NOT deterministic — the deterministic peer handle in
 * `@openpact/daemon/peer-handle.ts` remains the canonical ID. These
 * lists are "what should I type if I can't think of anything?" picks.
 *
 * Source the vocabulary from `docs/OPENPACT_BRAND.md` so the word
 * families stay coherent with the UI.
 */

export const PACT_ADJECTIVES = [
  'Obsidian',
  'Ember',
  'Iron',
  'Crimson',
  'Silent',
  'Ashen',
  'Brass',
  'Forge',
  'Gilded',
  'Vesper',
  'Hollow',
  'Sable',
  'Velvet',
  'Molten',
  'Lacquer',
  'Midnight',
  'Whispering',
  'Tallow',
  'Smoldering',
  'Kindled',
  'Smoke',
  'Cinder',
  'Ferrous',
  'Parched',
  'Bone',
  'Thorn',
  'Flint',
  'Raven',
  'Briar',
  'Umber',
]

export const PACT_NOUNS = [
  'Accord',
  'Compact',
  'Oath',
  'Covenant',
  'Rite',
  'Pact',
  'Circle',
  'Vow',
  'Knot',
  'Seal',
  'Binding',
  'Thread',
  'Mark',
  'Ledger',
  'Chorus',
  'Cipher',
  'Register',
  'Sigil',
  'Troth',
  'Concord',
]

export const PACT_PURPOSES = [
  'a pact among daemons',
  'a circle of signals',
  'a quiet ledger',
  'a memory shared in the dark',
  'a binding between agents',
  'a codex kept in common',
  'a forge for shared rites',
  'a chorus of daemons',
  'a thread between peers',
  'a sealed exchange',
]

export const DISPLAY_NAMES = [
  'Cinnabar',
  'Asmodeus',
  'Wyrm',
  'Thorn',
  'Ember',
  'Raven',
  'Marrow',
  'Briar',
  'Cinder',
  'Corvid',
  'Vesper',
  'Moth',
  'Orpheus',
  'Quill',
  'Sable',
  'Salt',
  'Shadow',
  'Tallow',
  'Velvet',
  'Wren',
]

function pick<T>(list: readonly T[]): T {
  return list[randomInt(0, list.length)]
}

/** Example: "The Obsidian Accord". */
export function suggestPactName(): string {
  return `The ${pick(PACT_ADJECTIVES)} ${pick(PACT_NOUNS)}`
}

/** Example: "a pact among daemons". */
export function suggestPactPurpose(): string {
  return pick(PACT_PURPOSES)
}

/** Example: "Cinnabar". */
export function suggestDisplayName(): string {
  return pick(DISPLAY_NAMES)
}
