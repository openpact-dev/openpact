import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { HttpError } from '../errors'
import { resolvePact } from '../pact-resolver'
import { RedeemError } from '../../invites'

const NONCE_RE = /^[0-9a-f]{48}$/i
const MIN_TTL_MS = 60_000 // 1 minute
const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

const createSchema = {
  type: 'object',
  properties: {
    ttl_ms: { type: 'integer', minimum: MIN_TTL_MS, maximum: MAX_TTL_MS },
    confirm: { type: 'boolean' },
  },
  required: ['confirm'],
  additionalProperties: false,
}

const redeemSchema = {
  type: 'object',
  properties: {
    token: { type: 'string', minLength: 8, maxLength: 4096 },
    writer_key: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    confirm: { type: 'boolean' },
  },
  required: ['token', 'writer_key', 'confirm'],
  additionalProperties: false,
}

const revokeSchema = {
  type: 'object',
  properties: {
    confirm: { type: 'string', pattern: '^[0-9a-f]{48}$' },
  },
  required: ['confirm'],
  additionalProperties: false,
}

function buildShareUrl(token: string): string {
  const base = process.env.OPENPACT_JOIN_BASE_URL || 'https://openpact.dev/join'
  return `${base}?invite=${token}`
}

export default async function invitesRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  // Mint a fresh one-time invite. Creator-only (alignment with the
  // other admin mutation endpoints). Not a replicated operation: the
  // creator's daemon holds the invites.json and only its redeem path
  // can consume it.
  app.post<{
    Params: { pactId: string }
    Body: { ttl_ms?: number; confirm: boolean }
  }>(
    '/v1/pacts/:pactId/invites',
    { schema: { body: createSchema } },
    async (req) => {
      if (req.body.confirm !== true) {
        throw new HttpError(
          400,
          'NOT_CONFIRMED',
          'POST /invites requires explicit { "confirm": true }',
        )
      }
      const pact = await resolvePact(daemon, req)
      if (pact.role !== 'creator') {
        throw new HttpError(
          409,
          'NOT_CREATOR',
          `pact.role is ${pact.role}; only the creator may mint invite tokens`,
        )
      }
      const { token, invite } = await pact.createInvite({ ttlMs: req.body.ttl_ms })
      return {
        token,
        share_url: buildShareUrl(token),
        nonce: invite.nonce,
        expires_at: invite.expiresAt,
      }
    },
  )

  // List live + dead invites for a pact. Readable by anyone who can
  // resolve the pact; the nonce is already a secret in transit only
  // (it's stored locally, never replicated).
  app.get<{ Params: { pactId: string } }>('/v1/pacts/:pactId/invites', async (req) => {
    const pact = await resolvePact(daemon, req)
    const entries = await pact.listInvites()
    return { entries, cursor: null, has_more: false }
  })

  // Revoke an unspent invite. Idempotent.
  app.delete<{
    Params: { pactId: string; nonce: string }
    Body: { confirm: string }
  }>(
    '/v1/pacts/:pactId/invites/:nonce',
    { schema: { body: revokeSchema } },
    async (req) => {
      if (!NONCE_RE.test(req.params.nonce)) {
        throw new HttpError(400, 'BAD_REQUEST', 'nonce must be 48-hex')
      }
      if (req.body.confirm !== req.params.nonce) {
        throw new HttpError(
          400,
          'NOT_CONFIRMED',
          'revoke requires { "confirm": "<nonce>" } matching the URL',
        )
      }
      const pact = await resolvePact(daemon, req)
      if (pact.role !== 'creator') {
        throw new HttpError(
          409,
          'NOT_CREATOR',
          `pact.role is ${pact.role}; only the creator may revoke invite tokens`,
        )
      }
      try {
        await pact.revokeInvite(req.params.nonce)
      } catch (e) {
        throw new HttpError(404, 'UNKNOWN_INVITE', (e as Error).message)
      }
      return { ok: true, nonce: req.params.nonce }
    },
  )

  // Redeem a token on behalf of a new writer. On success, this daemon
  // appends `invite-redeemed` + `admin.addWriter` to its writer core.
  // Caller passes the joiner's writer_key (the Autobase local core
  // public key), which the REST client can get from its own daemon's
  // /status endpoint.
  app.post<{
    Params: { pactId: string }
    Body: { token: string; writer_key: string; confirm: boolean }
  }>(
    '/v1/pacts/:pactId/invites/redeem',
    { schema: { body: redeemSchema } },
    async (req) => {
      if (req.body.confirm !== true) {
        throw new HttpError(
          400,
          'NOT_CONFIRMED',
          'redeem requires explicit { "confirm": true } in the request body',
        )
      }
      const pact = await resolvePact(daemon, req)
      try {
        const result = await pact.redeemInvite(req.body.token, req.body.writer_key)
        return { ok: true, nonce: result.nonce }
      } catch (e) {
        if (e instanceof RedeemError) {
          throw new HttpError(e.status, e.code, e.message)
        }
        throw e
      }
    },
  )
}
