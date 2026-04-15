import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji } from '../lib/theme'

export interface InviteOpts {
  /** Print the key of this specific pact (by alias). Defaults to the host's currentAlias. */
  pact?: string
}

const SITE_JOIN_BASE = 'https://openpact.dev/join'

/**
 * Build the friendly share URL for a pact. Pact name and inviter
 * display-name are optional enrichments; the /join page degrades
 * gracefully without them.
 */
function buildShareUrl(pactId: string, pactName: string | null, fromDisplayName: string | null) {
  const params = new URLSearchParams({ key: pactId })
  if (pactName) params.set('pact', pactName)
  if (fromDisplayName) params.set('from', fromDisplayName)
  return `${SITE_JOIN_BASE}?${params.toString()}`
}

export async function inviteCmd(
  opts: InviteOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  const registry = await daemonConfig.loadDaemonConfig(hostDir).catch(() => null)
  if (!registry || registry.pacts.length === 0) {
    throw new Error(`no pacts at ${hostDir} — run \`openpact init\` first`)
  }
  const alias = opts.pact ?? registry.currentAlias ?? registry.pacts[0]?.alias
  const entry = registry.pacts.find((p) => p.alias === alias)
  if (!entry) {
    throw new Error(
      `no pact named ${alias} at ${hostDir}. known: ${registry.pacts.map((p) => p.alias).join(', ')}`,
    )
  }

  // The key goes to stdout, unadorned. Preserves `KEY=$(openpact invite)`.
  process.stdout.write(entry.pactId + '\n')

  // When attached to a terminal, also print the friendly share URL and a
  // short hint to stderr. Piped usage stays silent, so scripts still work.
  if (process.stdout.isTTY) {
    const pactCfg = await daemonConfig.loadPactConfig(entry.dataDir).catch(() => null)
    const shareUrl = buildShareUrl(
      entry.pactId,
      pactCfg?.pactName ?? null,
      pactCfg?.displayName ?? null,
    )
    process.stderr.write('\n')
    process.stderr.write(`  ${emoji.brand} ${c.brandBold('Share this link to invite anyone:')}\n`)
    process.stderr.write(`  ${c.ash(shareUrl)}\n`)
    process.stderr.write('\n')
    process.stderr.write(
      c.ash('  The link lands on a page with copy-pasteable install and join commands.\n'),
    )
    process.stderr.write(
      c.ash('  A new joiner enters as a reader. Run `openpact add-writer <key>` to promote.\n'),
    )
  }
}
