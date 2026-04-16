import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { HttpError } from '../errors'
import { DISPLAY_NAME_MAX, PACT_NAME_MAX, PACT_PURPOSE_MAX } from '../../config'
import { resolvePact } from '../pact-resolver'

const HEX64 = /^[0-9a-f]{64}$/i

const addWriterSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    indexer: { type: 'boolean' },
  },
  required: ['key'],
  additionalProperties: false,
}

const promoteSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    confirm: { type: 'boolean' },
  },
  required: ['key', 'confirm'],
  additionalProperties: false,
}

const pactInfoSchema = {
  type: 'object',
  properties: {
    name: { type: ['string', 'null'], maxLength: PACT_NAME_MAX },
    purpose: { type: ['string', 'null'], maxLength: PACT_PURPOSE_MAX },
  },
  additionalProperties: false,
}

const meSchema = {
  type: 'object',
  properties: {
    display_name: { type: ['string', 'null'], maxLength: DISPLAY_NAME_MAX },
  },
  additionalProperties: false,
}

export default async function adminRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  // Raw membership plumbing — add / remove members on this pact.
  app.post<{ Params: { pactId: string }; Body: { key: string; indexer?: boolean } }>(
    '/v1/pacts/:pactId/admin/members',
    { schema: { body: addWriterSchema } },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      if (!pact.isMember) {
        throw new HttpError(
          409,
          'NOT_A_MEMBER',
          'this peer is not a member of the pact and cannot issue admin entries',
        )
      }
      await pact.addWriter(req.body.key, { indexer: !!req.body.indexer })
      return { ok: true, key: req.body.key, indexer: !!req.body.indexer }
    },
  )

  app.delete<{ Params: { pactId: string; key: string } }>(
    '/v1/pacts/:pactId/admin/members/:key',
    async (req) => {
      if (!HEX64.test(req.params.key)) {
        throw new HttpError(
          400,
          'BAD_REQUEST',
          `key must be 64 hex chars (got ${req.params.key.length})`,
        )
      }
      const pact = await resolvePact(daemon, req)
      if (!pact.isMember) {
        throw new HttpError(
          409,
          'NOT_A_MEMBER',
          'this peer is not a member of the pact and cannot issue admin entries',
        )
      }
      await pact.removeWriter(req.params.key)
      return { ok: true, key: req.params.key }
    },
  )

  // Dashboard-flavoured wrappers. Creator-only, require explicit confirm.
  app.post<{ Params: { pactId: string }; Body: { key: string; confirm: boolean } }>(
    '/v1/pacts/:pactId/admin/promote',
    { schema: { body: promoteSchema } },
    async (req) => {
      if (req.body.confirm !== true) {
        throw new HttpError(
          400,
          'NOT_CONFIRMED',
          'promote requires explicit { "confirm": true } in the request body',
        )
      }
      const pact = await resolvePact(daemon, req)
      if (pact.role !== 'creator') {
        throw new HttpError(
          409,
          'NOT_INDEXER',
          `pact.role is ${pact.role}; only the creator may promote members to indexer`,
        )
      }
      await pact.addWriter(req.body.key, { indexer: true })
      return { ok: true, key: req.body.key, indexer: true }
    },
  )

  app.post<{ Params: { pactId: string }; Body: { key: string; confirm: boolean } }>(
    '/v1/pacts/:pactId/admin/remove',
    { schema: { body: promoteSchema } },
    async (req) => {
      if (req.body.confirm !== true) {
        throw new HttpError(
          400,
          'NOT_CONFIRMED',
          'remove requires explicit { "confirm": true } in the request body',
        )
      }
      const pact = await resolvePact(daemon, req)
      if (pact.role !== 'creator') {
        throw new HttpError(
          409,
          'NOT_INDEXER',
          `pact.role is ${pact.role}; only the creator may remove members`,
        )
      }
      await pact.removeWriter(req.body.key)
      return { ok: true, key: req.body.key }
    },
  )

  // Pact metadata — creator-only. Null clears a field; omit to leave untouched.
  app.put<{ Params: { pactId: string }; Body: { name?: string | null; purpose?: string | null } }>(
    '/v1/pacts/:pactId/info',
    { schema: { body: pactInfoSchema } },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      if (pact.role !== 'creator') {
        throw new HttpError(
          409,
          'NOT_INDEXER',
          `pact.role is ${pact.role}; only the creator may rename the pact`,
        )
      }
      await pact.setPactInfo({ name: req.body.name, purpose: req.body.purpose })
      return { ok: true, pact_name: pact.pactName, pact_purpose: pact.pactPurpose }
    },
  )

  // This peer's display name on this pact. Any peer may edit their own.
  app.put<{ Params: { pactId: string }; Body: { display_name?: string | null } }>(
    '/v1/pacts/:pactId/me',
    { schema: { body: meSchema } },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      await pact.setDisplayName(req.body.display_name ?? null)
      return { ok: true, display_name: pact.displayName }
    },
  )
}
