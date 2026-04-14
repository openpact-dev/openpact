import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { HttpError } from '../errors'

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

interface AddBody {
  key: string
  indexer?: boolean
}

interface RemoveParams {
  key: string
}

export default async function adminRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.post<{ Body: AddBody }>(
    '/v1/admin/writers',
    { schema: { body: addWriterSchema } },
    async (req) => {
      if (!daemon.isWriter) {
        throw new HttpError(
          409,
          'NOT_A_WRITER',
          'this daemon is not a writer for the pact and cannot issue admin entries',
        )
      }
      await daemon.addWriter(req.body.key, { indexer: !!req.body.indexer })
      return { ok: true, key: req.body.key, indexer: !!req.body.indexer }
    },
  )

  app.delete<{ Params: RemoveParams }>('/v1/admin/writers/:key', async (req) => {
    if (!HEX64.test(req.params.key)) {
      throw new HttpError(
        400,
        'BAD_REQUEST',
        `key must be 64 hex chars (got ${req.params.key.length})`,
      )
    }
    if (!daemon.isWriter) {
      throw new HttpError(
        409,
        'NOT_A_WRITER',
        'this daemon is not a writer for the pact and cannot issue admin entries',
      )
    }
    await daemon.removeWriter(req.params.key)
    return { ok: true, key: req.params.key }
  })
}
