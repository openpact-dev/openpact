import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { listByType } from '../views'
import { resolvePact } from '../pact-resolver'

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

interface ListQuery {
  topic?: string
  limit?: number
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
            topic: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
          },
        },
      },
    },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const { topic, limit } = req.query
      return listByType(pact.view, 'knowledge', {
        limit,
        filter: topic ? (v) => v?.payload?.topic === topic : undefined,
      })
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
      return { id: result.id, timestamp }
    },
  )
}
