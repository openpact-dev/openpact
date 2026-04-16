import { type GlobalCliOpts } from '../lib/data-dir'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { c, emoji } from '../lib/theme'
import { askText } from '../lib/prompt'
import { suggestDisplayName } from '../lib/themes'
import { startCmd } from './start'

/**
 * Lightweight token decoder — mirrors the daemon's invites.ts. Kept
 * local so the CLI can surface pact name and expiry before it even
 * talks to the daemon.
 */
interface Decoded {
  pactId: string
  nonce: string
  expiresAt: string
  pactName: string | null
  pactPurpose: string | null
  issuerDisplay: string | null
}

function decodeToken(token: string): Decoded {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('empty token')
  }
  let json: string
  try {
    json = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    throw new Error('token is not valid base64url')
  }
  let obj: unknown
  try {
    obj = JSON.parse(json)
  } catch {
    throw new Error('token payload is not valid JSON')
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('token payload must be a JSON object')
  }
  const p = obj as Partial<Decoded> & { v?: number }
  if (p.v !== 1) {
    throw new Error(`unsupported token version: ${String(p.v)}`)
  }
  if (typeof p.pactId !== 'string' || !/^[0-9a-f]{64}$/i.test(p.pactId)) {
    throw new Error('token.pactId is missing or not 64-hex')
  }
  if (typeof p.nonce !== 'string' || !/^[0-9a-f]{48}$/i.test(p.nonce)) {
    throw new Error('token.nonce is missing or not 48-hex')
  }
  if (typeof p.expiresAt !== 'string' || Number.isNaN(Date.parse(p.expiresAt))) {
    throw new Error('token.expiresAt is missing or not an ISO timestamp')
  }
  return {
    pactId: p.pactId,
    nonce: p.nonce,
    expiresAt: p.expiresAt,
    pactName: typeof p.pactName === 'string' ? p.pactName : null,
    pactPurpose: typeof p.pactPurpose === 'string' ? p.pactPurpose : null,
    issuerDisplay: typeof p.issuerDisplay === 'string' ? p.issuerDisplay : null,
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

  // Ping before prompting so we auto-start without the user first
  // typing an agent name into a dead daemon.
  const hostApi = new ApiClient({ port: apiPort })
  try {
    await hostApi.ping()
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      process.stderr.write(c.ash('  daemon not running, summoning one…\n'))
      await startCmd(
        { port: opts.port, dashboard: opts.dashboard, dashboardPort: opts.dashboardPort },
        cmd,
      )
      await hostApi.ping() // startCmd already waited for ready; this just surfaces a clean error if something went sideways
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

  // 1. Join the swarm using the pactId extracted from the token.
  let joined: { alias: string; pact_id: string }
  try {
    const res = await hostApi.joinPact(decoded.pactId, {
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
    process.stderr.write(`  ${emoji.brand} ${c.brandBold('Swarm joined. Redeeming invite…')}\n`)
    if (decoded.pactName) {
      process.stderr.write(c.ash(`  Pact    ${decoded.pactName}\n`))
    }
    if (decoded.issuerDisplay) {
      process.stderr.write(c.ash(`  Invite  from ${decoded.issuerDisplay}\n`))
    }
    process.stderr.write(c.ash(`  Alias   ${joined.alias}\n`))
  }

  const pactApi = new ApiClient({ port: apiPort, pactId: joined.alias })

  // 2. Find our own member key.
  const status = await pactApi.status()
  const memberKey = status.public_key as string

  // 3. Wait for at least one peer, then redeem.
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    const status = await pactApi.status().catch(() => null)
    if ((status?.peers ?? 0) > 0) {
      try {
        await pactApi.redeemInvite(tokenArg, memberKey)
        lastErr = null
        break
      } catch (err) {
        lastErr = err
        const code = (err as { code?: string }).code
        // Transient / retry-worthy codes: NO_PEERS, NO_INDEXER_REACHABLE, TIMEOUT.
        if (code === 'INVITE_SPENT' || code === 'INVITE_EXPIRED' || code === 'INVITE_REVOKED') {
          throw err
        }
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (lastErr) throw lastErr
  if (Date.now() >= deadline) {
    throw new Error(
      `could not find an indexer peer within ${timeoutMs / 1000}s — is the creator online?`,
    )
  }

  // 4. Wait for the membership grant to confirm on our frontier.
  const memberDeadline = Date.now() + timeoutMs
  while (Date.now() < memberDeadline) {
    const s = await pactApi.status()
    if (s.is_member === true) break
    await new Promise((r) => setTimeout(r, 250))
  }
  const finalStatus = await pactApi.status()

  if (process.stdout.isTTY) {
    process.stderr.write('\n')
    if (finalStatus.is_member) {
      process.stderr.write(
        `  ${emoji.brand} ${c.brandBold('You are now a pact member. Welcome to the pact.')}\n`,
      )
    } else {
      process.stderr.write(
        `  ${emoji.cross} ${c.brand('redeem succeeded but membership has not landed yet.')}\n`,
      )
      process.stderr.write(
        c.ash('  Give Autobase a moment to converge, then check with `openpact status`.\n'),
      )
    }
    process.stderr.write(c.ash(`  Agent   ${displayName} (${finalStatus.peer_handle})\n`))
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
