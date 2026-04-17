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
//
// `reply_to` threads replies back to a parent message. Under the hood
// this is just an entry in the top-level `refs` array, which already
// powers the reverse-ref index (`ref/<target>/<source>` keys). Callers
// can read a thread via GET /v1/pacts/:pactId/entries/:id/referenced-by.
// Only the POST body surface exposes `reply_to`; internally messages
// and every other entry type share the same `refs: string[]` mechanism.
const MESSAGE_ID_RE = '^[0-9a-f]{8}-\\d+$'

const messagePayloadSchema = {
  type: 'object',
  properties: {
    content: { type: 'string', minLength: 1 },
    priority: { enum: ['low', 'normal', 'high'] },
    reply_to: { type: 'string', pattern: MESSAGE_ID_RE },
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
      // Strip `reply_to` off the payload and hoist it onto the entry's
      // top-level `refs` array. This keeps the stored payload shape
      // unchanged (just {content, priority?, kind?, ...system-fields})
      // while making threaded lookups walk the reverse-ref index the
      // rest of the daemon already maintains.
      const body = req.body as Record<string, unknown>
      const { reply_to, ...payload } = body as { reply_to?: string } & Record<string, unknown>
      const refs = typeof reply_to === 'string' && reply_to ? [reply_to] : undefined
      const timestamp = new Date().toISOString()
      const entry = {
        type: 'message' as const,
        timestamp,
        agent_id: pact.peerHandle!,
        display_name: pact.displayName,
        payload,
        ...(refs ? { refs } : {}),
      }
      const result = await pact.append(entry)
      return {
        id: result.id,
        ...entry,
      }
    },
  )
}
