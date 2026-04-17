import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { c, emoji } from '../lib/theme'
import { card, table } from '../lib/format'

interface InviteRow {
  nonce: string
  expires_at: string
  spent_at?: string | null
  revoked?: boolean
  dead: boolean
}

export interface InviteOpts {
  /** Alias of the pact to issue against. Defaults to the host's currentAlias. */
  pact?: string
  /** REST port. Defaults to 7666. */
  port?: string | number
  /** Time-to-live, human form (e.g. `1h`, `3d`, `24h`). Default: 7 days. */
  ttl?: string
  /** Show all live + dead invites and exit. */
  list?: boolean
  /** Revoke an invite by nonce and exit. */
  revoke?: string
}

/**
 * Default invite TTL for the CLI surface. Matches the daemon default
 * (DEFAULT_TTL_MS in packages/daemon/src/invites.ts) — kept in sync
 * here so a missing --ttl produces the same duration server-side.
 */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function inviteCmd(
  opts: InviteOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  const pactId = await resolveCurrentPact(hostDir, opts.pact)
  const apiPort = Number(opts.port ?? 7666)
  const client = new OpenPact({ port: apiPort, pactId, hostDir })

  try {
    if (opts.revoke) {
      await client.invites.revoke(opts.revoke)
      if (process.stdout.isTTY) {
        process.stderr.write(
          `  ${emoji.brand} ${c.brandBold('Invite revoked.')}  ${c.ash(opts.revoke)}\n`,
        )
      }
      return
    }

    if (opts.list) {
      const entries = (await client.invites.list()) as InviteRow[]
      const live = entries.filter((e) => !e.dead)
      const dead = entries.filter((e) => e.dead)

      if (live.length === 0 && dead.length === 0) {
        console.log(
          table<InviteRow>({
            title: 'Invites',
            subtitle: pactId,
            columns: [
              { header: 'Nonce', value: () => '' },
              { header: 'Status', value: () => '' },
              { header: 'When', value: () => '' },
            ],
            rows: [],
            empty: 'No invites yet. Run `openpact invite` to mint one.',
          }),
        )
        return
      }

      console.log(
        table<InviteRow>({
          title: 'Invites',
          subtitle: `${pactId}  ·  ${live.length} live, ${dead.length} dead`,
          columns: [
            {
              header: 'Nonce',
              value: (i) => (i.dead ? c.ash(shortenNonce(i.nonce)) : c.bone(shortenNonce(i.nonce))),
            },
            {
              header: 'Status',
              value: (i) =>
                i.dead
                  ? i.spent_at
                    ? c.ash('spent')
                    : i.revoked
                      ? c.ember('revoked')
                      : c.ash('expired')
                  : `${c.brand('●')} live`,
            },
            {
              header: 'When',
              value: (i) =>
                c.ash(
                  i.dead
                    ? i.spent_at
                      ? relative(i.spent_at)
                      : 'past'
                    : 'expires ' + relative(i.expires_at),
                ),
            },
          ],
          rows: [...live, ...dead],
        }),
      )
      return
    }

    const ttlMs = opts.ttl ? parseTtl(opts.ttl) : DEFAULT_TTL_MS
    const invite = await client.invites.create({ ttlMs })

    // Share URL to stdout — scripts pipe it around, humans copy-paste.
    process.stdout.write(invite.share_url + '\n')

    if (process.stdout.isTTY) {
      process.stderr.write('\n')
      process.stderr.write(`  ${emoji.brand} ${c.brandBold('One-time invite minted.')}\n`)
      process.stderr.write('\n')
      process.stderr.write(
        card({
          title: 'Invite',
          subtitle: pactId,
          sections: [
            {
              rows: [
                ['Share URL', c.bone(invite.share_url)],
                ['Expires', c.ash(`${relative(invite.expires_at)}  (${invite.expires_at})`)],
                ['Nonce', c.ash(invite.nonce)],
              ],
            },
          ],
          next: [['openpact invite --revoke ' + invite.nonce, 'Cancel before it is redeemed']],
        }) + '\n',
      )
    }
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
      console.error(`  ${c.ash('Start it with `openpact start`.')}`)
      process.exit(1)
    }
    throw err
  }
}

function parseTtl(input: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim())
  if (!m) {
    throw new Error(`unrecognised --ttl value: ${input} (try 30m, 24h, 7d)`)
  }
  const n = Number(m[1])
  const unit = m[2]
  const mult =
    unit === 'ms'
      ? 1
      : unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : 86_400_000
  return n * mult
}

function shortenNonce(nonce: string): string {
  return `${nonce.slice(0, 8)}…${nonce.slice(-4)}`
}

function relative(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  const absMs = Math.abs(ms)
  const future = ms >= 0
  const units: Array<[string, number]> = [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1000],
  ]
  for (const [label, div] of units) {
    if (absMs >= div) {
      const n = Math.round(absMs / div)
      return future ? `in ${n}${label}` : `${n}${label} ago`
    }
  }
  return future ? 'now' : 'just now'
}
