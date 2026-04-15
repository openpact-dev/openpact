import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c } from '../lib/theme'

export interface ListOpts {
  /** Machine-readable JSON for scripting. */
  json?: boolean
}

/**
 * `openpact list` — enumerate every pact on this host.
 *
 * Reads daemon.json directly; no running daemon needed. The output is
 * a table by default; `--json` switches to the registry's raw shape so
 * scripts can pipe into jq.
 */
export async function listCmd(
  opts: ListOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  const registry = await daemonConfig.loadDaemonConfig(hostDir).catch(() => null)

  if (!registry || registry.pacts.length === 0) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ current: null, pacts: [] }) + '\n')
      return
    }
    console.log(c.ash(`no pacts at ${hostDir}. run \`openpact init\` to seal one.`))
    return
  }

  if (opts.json) {
    // Enrich with each pact's name/purpose from its config.json.
    const pacts = await Promise.all(
      registry.pacts.map(async (p) => {
        const cfg = await daemonConfig.loadPactConfig(p.dataDir).catch(() => null)
        return {
          alias: p.alias,
          pact_id: p.pactId,
          data_dir: p.dataDir,
          added_at: p.addedAt,
          is_current: p.alias === registry.currentAlias,
          pact_name: cfg?.pactName ?? null,
          pact_purpose: cfg?.pactPurpose ?? null,
          display_name: cfg?.displayName ?? null,
          role: cfg?.role ?? null,
        }
      }),
    )
    process.stdout.write(JSON.stringify({ current: registry.currentAlias, pacts }, null, 2) + '\n')
    return
  }

  // Table output. Columns: [current marker] alias · name · role · pact_id (12 chars).
  const rows = await Promise.all(
    registry.pacts.map(async (p) => {
      const cfg = await daemonConfig.loadPactConfig(p.dataDir).catch(() => null)
      return {
        marker: p.alias === registry.currentAlias ? '*' : ' ',
        alias: p.alias,
        name: cfg?.pactName ?? c.ash('(unnamed)'),
        role: cfg?.role ?? '—',
        pact_id: p.pactId.slice(0, 12) + '…',
      }
    }),
  )
  const aliasW = Math.max(5, ...rows.map((r) => r.alias.length))
  const nameW = Math.max(4, ...rows.map((r) => stripAnsi(r.name).length))
  const roleW = Math.max(4, ...rows.map((r) => r.role.length))

  // Header
  console.log(
    '  ' +
      c.ash(
        pad(' ', 1) +
          pad('ALIAS', aliasW) +
          '  ' +
          pad('NAME', nameW) +
          '  ' +
          pad('ROLE', roleW) +
          '  ' +
          'PACT ID',
      ),
  )
  for (const r of rows) {
    const line =
      r.marker +
      ' ' +
      pad(r.alias, aliasW) +
      '  ' +
      padVisible(r.name, nameW) +
      '  ' +
      pad(r.role, roleW) +
      '  ' +
      c.ash(r.pact_id)
    console.log(r.marker === '*' ? c.brandBold(line) : '  ' + line.slice(2))
  }
  console.log()
  console.log(
    c.ash(
      `current: ${registry.currentAlias ?? '(none)'} — use \`openpact switch <alias>\` to change`,
    ),
  )
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s
  return s + ' '.repeat(n - s.length)
}

function padVisible(s: string, n: number): string {
  const visible = stripAnsi(s).length
  if (visible >= n) return s
  return s + ' '.repeat(n - visible)
}

function stripAnsi(s: string): string {
  // ANSI escape sequences — picocolors emits ESC[...]m around colored
  // text. The \x1b control char is intentional; suppress the lint.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
