import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c } from '../lib/theme'
import { table, short, type Column } from '../lib/format'

export interface ListOpts {
  /** Machine-readable JSON for scripting. */
  json?: boolean
}

interface Row {
  current: boolean
  alias: string
  name: string
  role: string
  pactId: string
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
    console.log(
      table<Row>({
        title: 'Pacts on this host',
        columns: emptyColumns(),
        rows: [],
        empty: 'No pacts yet. Run `openpact init` to seal one.',
      }),
    )
    return
  }

  if (opts.json) {
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

  const rows: Row[] = await Promise.all(
    registry.pacts.map(async (p) => {
      const cfg = await daemonConfig.loadPactConfig(p.dataDir).catch(() => null)
      return {
        current: p.alias === registry.currentAlias,
        alias: p.alias,
        name: cfg?.pactName ?? '(unnamed)',
        role: cfg?.role ?? '—',
        pactId: short(p.pactId, 12) + '…',
      }
    }),
  )

  console.log(
    table<Row>({
      title: 'Pacts on this host',
      subtitle: `${rows.length} total`,
      columns: [
        {
          header: '',
          value: (r: Row) => (r.current ? c.brand('●') : ' '),
          minWidth: 1,
        },
        {
          header: 'Alias',
          value: (r: Row) => (r.current ? c.brandBold(r.alias) : c.bone(r.alias)),
        },
        {
          header: 'Name',
          value: (r: Row) => (r.name === '(unnamed)' ? c.ash(r.name) : c.bone(r.name)),
        },
        { header: 'Role', value: (r: Row) => r.role },
        { header: 'Pact ID', value: (r: Row) => c.ash(r.pactId) },
      ],
      rows,
      footer: c.ash(
        `Current: ${registry.currentAlias ?? 'none'}. Use \`openpact switch <alias>\` to change.`,
      ),
    }),
  )
}

function emptyColumns(): Column<Row>[] {
  return [
    { header: '', value: () => '', minWidth: 1 },
    { header: 'Alias', value: () => '' },
    { header: 'Name', value: () => '' },
    { header: 'Role', value: () => '' },
    { header: 'Pact ID', value: () => '' },
  ]
}
