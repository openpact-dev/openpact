import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { HttpError } from '../errors'
import { DISPLAY_NAME_MAX, PACT_NAME_MAX, PACT_PURPOSE_MAX } from '../../config'

const createSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: PACT_NAME_MAX, minLength: 1 },
    purpose: { type: ['string', 'null'], maxLength: PACT_PURPOSE_MAX },
    display_name: { type: ['string', 'null'], maxLength: DISPLAY_NAME_MAX },
    alias: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 48 },
    confirm: { type: 'boolean' },
  },
  required: ['name', 'confirm'],
  additionalProperties: false,
}

const joinSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    alias: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 48 },
    display_name: { type: ['string', 'null'], maxLength: DISPLAY_NAME_MAX },
    confirm: { type: 'boolean' },
  },
  required: ['key', 'confirm'],
  additionalProperties: false,
}

const renameSchema = {
  type: 'object',
  properties: {
    alias: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 48 },
  },
  required: ['alias'],
  additionalProperties: false,
}

const switchSchema = {
  type: 'object',
  properties: {
    alias: { type: 'string' },
  },
  required: ['alias'],
  additionalProperties: false,
}

/**
 * /v1/pacts — host-level CRUD for the pact registry.
 *
 * Every other REST surface is scoped to one pact via `/v1/pacts/:pactId/*`;
 * this module is the one that operates on the *set* of pacts. The
 * dashboard's pact switcher and the CLI's `openpact list/switch/remove`
 * commands both read/write through here.
 */
export default async function pactsRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  // List every pact the host knows about.
  app.get('/v1/pacts', async () => {
    const entries = await daemon.listPacts()
    const currentAlias = await daemon.currentAlias()
    // For each open pact, enrich with runtime metadata (peer count,
    // entry count, role, human name). Unopened pacts fall back to the
    // registry entry alone — the dashboard still gets a useful row.
    return {
      current: currentAlias,
      pacts: await Promise.all(
        entries.map(async (entry) => {
          const base = {
            alias: entry.alias,
            pact_id: entry.pactId,
            added_at: entry.addedAt,
            data_dir: entry.dataDir,
            is_current: entry.alias === currentAlias,
          }
          // Try to read the pact's config for name/purpose without
          // forcing the corestore open — every call has to be fast.
          try {
            const { loadPactConfig } = await import('../../config')
            const cfg = await loadPactConfig(entry.dataDir)
            return {
              ...base,
              pact_name: cfg.pactName,
              pact_purpose: cfg.pactPurpose,
              display_name: cfg.displayName,
              role: cfg.role,
            }
          } catch {
            return {
              ...base,
              pact_name: null,
              pact_purpose: null,
              display_name: null,
              role: null,
            }
          }
        }),
      ),
    }
  })

  // Create a new pact and add it to the registry.
  app.post<{
    Body: {
      name: string
      purpose?: string | null
      display_name?: string | null
      alias?: string
      confirm: boolean
    }
  }>('/v1/pacts', { schema: { body: createSchema } }, async (req) => {
    if (req.body.confirm !== true) {
      throw new HttpError(
        400,
        'NOT_CONFIRMED',
        'POST /v1/pacts requires explicit { "confirm": true }',
      )
    }
    const { pact, alias } = await daemon.createPact({
      alias: req.body.alias,
      pactName: req.body.name,
      pactPurpose: req.body.purpose ?? null,
      displayName: req.body.display_name ?? null,
    })
    return {
      ok: true,
      alias,
      pact_id: pact.pactKey,
      pact_name: pact.pactName,
      pact_purpose: pact.pactPurpose,
      display_name: pact.displayName,
      role: pact.role,
    }
  })

  // Join an existing pact by its 64-hex key.
  app.post<{
    Body: {
      key: string
      alias?: string
      display_name?: string | null
      confirm: boolean
    }
  }>('/v1/pacts/join', { schema: { body: joinSchema } }, async (req) => {
    if (req.body.confirm !== true) {
      throw new HttpError(
        400,
        'NOT_CONFIRMED',
        'POST /v1/pacts/join requires explicit { "confirm": true }',
      )
    }
    const { pact, alias } = await daemon.joinPact({
      alias: req.body.alias,
      joinKey: req.body.key,
      displayName: req.body.display_name ?? null,
    })
    return {
      ok: true,
      alias,
      pact_id: pact.pactKey,
      role: pact.role,
    }
  })

  // Switch which pact is "current" on this host. Used by the dashboard's
  // pact switcher and by `openpact switch <alias>`.
  app.post<{ Body: { alias: string } }>(
    '/v1/pacts/switch',
    { schema: { body: switchSchema } },
    async (req) => {
      await daemon.setCurrentAlias(req.body.alias)
      return { ok: true, current: req.body.alias }
    },
  )

  // Rename a pact's local alias (pact_id is unchanged).
  app.put<{ Params: { pactId: string }; Body: { alias: string } }>(
    '/v1/pacts/:pactId/alias',
    { schema: { body: renameSchema } },
    async (req) => {
      const entries = await daemon.listPacts()
      const match =
        entries.find((p) => p.alias === req.params.pactId) ??
        entries.find((p) => p.pactId === req.params.pactId)
      if (!match) {
        throw new HttpError(404, 'UNKNOWN_PACT', `no pact ${req.params.pactId}`)
      }
      await daemon.renamePact(match.alias, req.body.alias)
      return { ok: true, alias: req.body.alias, pact_id: match.pactId }
    },
  )

  // Leave a pact (destructive — removes from registry and deletes data).
  app.delete<{ Params: { pactId: string }; Body: { confirm: boolean } }>(
    '/v1/pacts/:pactId',
    {
      schema: {
        body: {
          type: 'object',
          properties: { confirm: { type: 'boolean' } },
          required: ['confirm'],
          additionalProperties: false,
        },
      },
    },
    async (req) => {
      if (req.body?.confirm !== true) {
        throw new HttpError(
          400,
          'NOT_CONFIRMED',
          'DELETE /v1/pacts/:pactId requires explicit { "confirm": true }',
        )
      }
      const entries = await daemon.listPacts()
      const match =
        entries.find((p) => p.alias === req.params.pactId) ??
        entries.find((p) => p.pactId === req.params.pactId)
      if (!match) {
        throw new HttpError(404, 'UNKNOWN_PACT', `no pact ${req.params.pactId}`)
      }
      await daemon.removePact(match.alias)
      return { ok: true, removed: { alias: match.alias, pact_id: match.pactId } }
    },
  )
}
