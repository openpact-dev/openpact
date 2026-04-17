import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { listByType, BadCursorError } from '../views'
import { HttpError } from '../errors'
import { resolvePact } from '../pact-resolver'
import { LIST_PAGE_QUERY, type ListPageQuery } from '../schemas'

const knowledgePayloadSchema = {
  type: 'object',
  properties: {
    topic: { type: 'string', minLength: 1, maxLength: 200 },
    content: { type: 'string', minLength: 1 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    source: { type: 'string' },
  },
  required: ['topic', 'content'],
  additionalProperties: true,
}

interface ListQuery extends ListPageQuery {
  topic?: string
}

export default async function knowledgeRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Params: { pactId: string }; Querystring: ListQuery }>(
    '/v1/pacts/:pactId/knowledge',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            ...LIST_PAGE_QUERY,
            topic: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const { topic, order, limit, cursor } = req.query
      try {
        return await listByType(pact.view, 'knowledge', {
          order,
          limit,
          cursor: cursor ?? null,
          filter: topic
            ? (v: unknown) => {
                const entry = v as { payload?: { topic?: unknown } } | null
                return entry?.payload?.topic === topic
              }
            : undefined,
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
    '/v1/pacts/:pactId/knowledge',
    { schema: { body: knowledgePayloadSchema } },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const payload = req.body as Record<string, unknown>
      const timestamp = new Date().toISOString()
      const result = await pact.append({
        type: 'knowledge',
        timestamp,
        agent_id: pact.peerHandle!,
        display_name: pact.displayName,
        payload,
      })
      return {
        id: result.id,
        type: 'knowledge',
        timestamp,
        agent_id: pact.peerHandle!,
        display_name: pact.displayName,
        payload,
      }
    },
  )
}
