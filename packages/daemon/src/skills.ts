/**
 * Canonical skill name + checksum helpers.
 *
 * `SKILL_NAME_RE` is the single source of truth for what counts as a
 * legal skill `name` or `version`. We reject any string that could
 * break out of the per-pact `skills/` directory when interpolated into
 * `${name}@${version}.${ext}` — that means no `..`, no leading/trailing
 * dots, no double dots, and no path separators.
 *
 * Concretely each segment must:
 *   - start with a lowercase alphanumeric,
 *   - continue with lowercase alphanumerics, `_`, or `-`,
 *   - be joined to other segments by a single `.`.
 *
 * So `foo`, `foo-bar`, `foo.bar`, `1.2.3-rc1` are all fine; `..`, `.`,
 * `foo..bar`, `foo.`, `.foo`, `/etc/passwd`, and `foo/bar` are all
 * rejected.
 *
 * Phase 2e also domain-separates the skill content checksum. Earlier
 * builds wrote `sha256:${sha256(content)}` — the same digest you'd get
 * for the same byte string anywhere else in the system, which made it
 * tempting to confuse a skill checksum with (say) a knowledge-entry
 * digest if the two ever crossed wires. We now hash a labelled prefix
 * so the skill domain is unmistakable.
 */
import { createHash } from 'crypto'

export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*$/

/** Domain label baked into every skill checksum. Bumping the trailing
 *  `:vN` invalidates older digests on purpose — clients have to
 *  recompute. */
export const SKILL_CHECKSUM_LABEL = 'openpact-skill-content:v1\n'

export function isValidSkillName(name: string): boolean {
  if (typeof name !== 'string') return false
  if (name.length === 0 || name.length > 200) return false
  return SKILL_NAME_RE.test(name)
}

/**
 * Compute the canonical skill content checksum.
 *
 *   sha256:<hex(sha256(SKILL_CHECKSUM_LABEL || content))>
 *
 * The label is utf-8 bytes ending in a `\n` — the newline can never
 * appear inside a `SKILL_NAME_RE` value, so it is impossible to spoof
 * a label by crafting a name.
 */
export function skillChecksum(content: string): string {
  const h = createHash('sha256')
  h.update(SKILL_CHECKSUM_LABEL, 'utf8')
  h.update(content, 'utf8')
  return 'sha256:' + h.digest('hex')
}
