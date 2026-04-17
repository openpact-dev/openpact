import { invites as inviteCodec, type InviteTokenPayload } from '@openpact/daemon'
import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji } from '../lib/theme'
import { card } from '../lib/format'
import { askText } from '../lib/prompt'
import { suggestDisplayName } from '../lib/themes'
import { startCmd } from './start'

// Phase 2d: the CLI used to carry its own copy of decodeToken. Both
// copies drifting independently is a correctness footgun — e.g. pre-
// flight here accepting `v:2` tokens the daemon would reject. We now
// import the canonical decoder from `@openpact/daemon` so the pre-flight
// validation matches exactly what the daemon will later accept on
// redeem. We only wrap it here to turn `InviteDecodeError` into a plain
// Error message for the user.
type Decoded = InviteTokenPayload

function decodeToken(token: string): Decoded {
  try {
    return inviteCodec.decodeToken(token)
  } catch (err) {
    throw new Error((err as Error).message)
  }
}

export interface JoinOpts {
  displayName?: string
  alias?: string
  interactive?: boolean
  port?: string | number
  /** How long to wait for a peer connection before giving up on the redeem. */
  timeout?: string | number
  /** Commander maps `--no-dashboard` to `dashboard: false`; forwarded to auto-start. */
  dashboard?: boolean
  /** Dashboard port override forwarded to auto-start (accepts 0 for OS-chosen). */
  dashboardPort?: string | number
}

export async function joinCmd(
  tokenArg: string,
  opts: JoinOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const transientRedeemCodes = new Set(['NO_PEERS', 'NO_INDEXER_REACHABLE', 'PEER_DISCONNECTED'])
  const terminalRedeemCodes = new Set([
    'INVITE_SPENT',
    'INVITE_EXPIRED',
    'INVITE_REVOKED',
    'UNKNOWN_INVITE',
    'INVITE_WRONG_PACT',
    'INVITE_BAD_SHAPE',
  ])

  let decoded: Decoded
  try {
    decoded = decodeToken(tokenArg)
  } catch (err) {
    throw new Error(`invalid invite token: ${(err as Error).message}`)
  }
  if (Date.parse(decoded.expiresAt) <= Date.now()) {
    throw new Error(
      `invite token expired at ${decoded.expiresAt}. Ask ${decoded.issuerDisplay ?? 'the creator'} for a fresh one.`,
    )
  }

  const apiPort = Number(opts.port ?? 7666)
  const timeoutMs = Number(opts.timeout ?? 30) * 1000
  const dir = resolveDataDir(cmd.optsWithGlobals())

  // Ping before prompting so we auto-start without the user first
  // typing an agent name into a dead daemon.
  const hostClient = new OpenPact({ port: apiPort, hostDir: dir })
  try {
    await hostClient.ping()
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      process.stderr.write(c.ash('  daemon not running, summoning one…\n'))
      await startCmd(
        { port: opts.port, dashboard: opts.dashboard, dashboardPort: opts.dashboardPort },
        cmd,
      )
      await hostClient.ping() // startCmd already waited for ready; this just surfaces a clean error if something went sideways
    } else {
      throw err
    }
  }

  const nonInteractive = opts.interactive === false
  const displayName = await askText({
    provided: opts.displayName,
    nonInteractive,
    default: suggestDisplayName(),
    label: 'Agent name',
    max: 64,
  })

  const chosenAlias =
    opts.alias ?? slugify(decoded.pactName ?? '') ?? `joined-${decoded.pactId.slice(0, 8)}`

  // 1. Join the pact using the pactId extracted from the token.
  let joined: { alias: string; pact_id: string }
  try {
    const res = await hostClient.pacts.join({
      key: decoded.pactId,
      alias: chosenAlias,
      display_name: displayName,
      pact_name: decoded.pactName,
      pact_purpose: decoded.pactPurpose,
    })
    joined = { alias: res.alias, pact_id: res.pact_id }
  } catch (err) {
    const e = err as { code?: string; message: string }
    // The daemon surfaces "alias already exists" as a 409; translate
    // to something more human without losing the underlying message.
    throw new Error(`could not join: ${e.message}`)
  }

  if (process.stdout.isTTY) {
    process.stderr.write('\n')
    process.stderr.write(`  ${emoji.brand} ${c.brandBold('Pact joined. Redeeming invite…')}\n`)
    process.stderr.write('\n')
    const rows: Array<[string, string]> = []
    if (decoded.pactName) rows.push(['Pact', c.bone(decoded.pactName)])
    if (decoded.issuerDisplay) rows.push(['Invited by', c.bone(decoded.issuerDisplay)])
    rows.push(['Alias', c.bone(joined.alias)])
    process.stderr.write(card({ title: 'Joining', sections: [{ rows }] }) + '\n')
  }

  const pactClient = new OpenPact({ port: apiPort, pactId: joined.alias, hostDir: dir })

  // 2. Find our own member key.
  const status = await pactClient.status()
  const memberKey = status.public_key as string

  // 3. Drive the redeem in a retry loop. The daemon's redeemThroughPeers
  // already returns NO_PEERS instantly when no swarm links exist and
  // NO_INDEXER_REACHABLE when peers are present but no indexer answered;
  // both are classified as transient below. Earlier this code gated on
  // `status.peers > 0`, but `peers` is now pact-scoped to authenticated
  // remote members, and a fresh joiner can't authenticate until after
  // admission — so the gate stayed false forever and the loop never
  // attempted the redeem.
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  let redeemed = false
  while (Date.now() < deadline) {
    try {
      await pactClient.invites.redeem(tokenArg, memberKey)
      redeemed = true
      break
    } catch (err) {
      lastErr = err
      const code = (err as { code?: string }).code
      if (code && terminalRedeemCodes.has(code)) throw err
      if (code && !transientRedeemCodes.has(code)) throw err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!redeemed) {
    if (lastErr) throw lastErr
    throw new Error(
      `could not reach an indexer within ${timeoutMs / 1000}s — is the creator online?`,
    )
  }

  // 4. Wait for the membership grant to confirm on our frontier.
  const memberDeadline = Date.now() + timeoutMs
  while (Date.now() < memberDeadline) {
    const s = await pactClient.status()
    if (s.is_member === true) break
    await new Promise((r) => setTimeout(r, 250))
  }
  const finalStatus = await pactClient.status()

  if (process.stdout.isTTY) {
    process.stderr.write('\n')
    if (finalStatus.is_member) {
      process.stderr.write(
        `  ${emoji.brand} ${c.brandBold('You are now a pact member. Welcome to the pact.')}\n`,
      )
    } else {
      process.stderr.write(
        `  ${emoji.cross} ${c.brand('Redeem succeeded but membership has not landed yet.')}\n`,
      )
      process.stderr.write(
        `  ${c.ash('Give Autobase a moment to converge, then check with `openpact status`.')}\n`,
      )
    }
    process.stderr.write(
      `  ${c.ash('Agent')}  ${c.bone(displayName)}  ${c.ash(`(${finalStatus.peer_handle})`)}\n`,
    )
  } else {
    // Piped / scripted: one JSON line on stdout.
    console.log(
      JSON.stringify({
        alias: joined.alias,
        pact_id: joined.pact_id,
        member: finalStatus.is_member,
        peer_handle: finalStatus.peer_handle,
      }),
    )
  }
}

function slugify(s: string): string | null {
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return out || null
}
