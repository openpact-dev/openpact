import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { listByType, BadCursorError } from '../views'
import { HttpError } from '../errors'
import { resolvePact } from '../pact-resolver'
import { LIST_PAGE_QUERY, type ListPageQuery } from '../schemas'

// Messages are pact-wide broadcasts. There is no `to` field — everything
// posted lands in the shared ledger and replicates to every member. The
// previous schema accepted a `to` peer handle that suggested per-recipient
// addressing, but the entries were never private (no encryption, no
// per-pair core), only labelled. The label was confusing without delivering
// any actual privacy, so the field is gone.
const messagePayloadSchema = {
  type: 'object',
  properties: {
    content: { type: 'string', minLength: 1 },
    priority: { enum: ['low', 'normal', 'high'] },
  },
  required: ['content'],
  additionalProperties: false,
}

interface ListQuery extends ListPageQuery {
  since?: string
}

export default async function messagesRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Params: { pactId: string }; Querystring: ListQuery }>(
    '/v1/pacts/:pactId/messages',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            ...LIST_PAGE_QUERY,
            since: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const { since, order, limit, cursor } = req.query
      try {
        return await listByType(pact.view, 'message', {
          order,
          limit,
          cursor: cursor ?? null,
          filter: (v: unknown) => {
            const entry = v as { timestamp?: string } | null
            if (since && typeof entry?.timestamp === 'string' && entry.timestamp <= since)
              return false
            return true
          },
        })
      } catch (err) {
        if (err instanceof BadCursorError) {
          throw new HttpError(400, 'BAD_CURSOR', err.message)
        }
        throw err
      }
    },
  )

  app.post<{ Params: { pactId: string } }>(
    '/v1/pacts/:pactId/messages',
    { schema: { body: messagePayloadSchema } },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const payload = req.body as Record<string, unknown>
      const timestamp = new Date().toISOString()
      const result = await pact.append({
        type: 'message',
        timestamp,
        agent_id: pact.peerHandle!,
        display_name: pact.displayName,
        payload,
      })
      return { id: result.id, timestamp }
    },
  )
}
