import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { listByType } from '../views'
import { resolvePact } from '../pact-resolver'

const PEER_HANDLE_RE = '^anon-[a-z]+-[0-9a-f]{4}$'

const messagePayloadSchema = {
  type: 'object',
  properties: {
    to: {
      oneOf: [{ const: '*' }, { type: 'string', pattern: PEER_HANDLE_RE }],
    },
    content: { type: 'string', minLength: 1 },
    priority: { enum: ['low', 'normal', 'high'] },
  },
  required: ['to', 'content'],
  additionalProperties: true,
}

interface ListQuery {
  since?: string
  to?: string
  limit?: number
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
            since: { type: 'string', format: 'date-time' },
            to: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
          },
        },
      },
    },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const { since, to, limit } = req.query
      return listByType(pact.view, 'message', {
        limit,
        filter: (v) => {
          if (since && v?.timestamp <= since) return false
          if (to && v?.payload?.to !== to) return false
          return true
        },
      })
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
