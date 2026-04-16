import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { c, emoji } from '../lib/theme'

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
  const api = new ApiClient({ port: apiPort, pactId })

  try {
    if (opts.revoke) {
      await api.revokeInvite(opts.revoke)
      if (process.stdout.isTTY) {
        process.stderr.write(
          `${emoji.brand} ${c.brandBold('Invite revoked.')} ${c.ash(opts.revoke)}\n`,
        )
      }
      return
    }

    if (opts.list) {
      const { entries } = await api.listInvites()
      const live = entries.filter((e) => !e.dead)
      const dead = entries.filter((e) => e.dead)
      if (live.length === 0 && dead.length === 0) {
        console.log(c.ash('no invites yet — run `openpact invite` to mint one'))
        return
      }
      if (live.length > 0) {
        console.log(c.brandBold(`Live (${live.length})`))
        for (const i of live) {
          console.log(
            `  ${c.bone(shortenNonce(i.nonce))}  ${c.ash('expires')} ${relative(i.expires_at)}`,
          )
        }
      }
      if (dead.length > 0) {
        if (live.length > 0) console.log()
        console.log(c.ash(`Spent / revoked / expired (${dead.length})`))
        for (const i of dead) {
          const reason = i.spent_at
            ? `spent ${relative(i.spent_at)}`
            : i.revoked
              ? 'revoked'
              : 'expired'
          console.log(`  ${c.ash(shortenNonce(i.nonce))}  ${c.ash(reason)}`)
        }
      }
      return
    }

    const ttlMs = opts.ttl ? parseTtl(opts.ttl) : DEFAULT_TTL_MS
    const invite = await api.createInvite({ ttl_ms: ttlMs })

    // Share URL to stdout — scripts pipe it around, humans copy-paste.
    process.stdout.write(invite.share_url + '\n')

    if (process.stdout.isTTY) {
      process.stderr.write('\n')
      process.stderr.write(`  ${emoji.brand} ${c.brandBold('One-time invite minted.')}\n`)
      process.stderr.write(
        c.ash(`  Expires ${relative(invite.expires_at)}. Redeem once to admit a new member.\n`),
      )
      process.stderr.write(c.ash(`  Nonce   ${invite.nonce}\n`))
      process.stderr.write(c.ash(`  Revoke  openpact invite --revoke ${invite.nonce}\n`))
    }
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('openpact daemon is not running')}`)
      console.error(c.ash(`  start it with:  openpact start`))
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
