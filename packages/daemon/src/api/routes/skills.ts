import { createHash } from 'crypto'
import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { listByType, getById } from '../views'
import { HttpError } from '../errors'

const SKILL_FORMATS = ['openclaw', 'langchain', 'generic'] as const

function expectedChecksum(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}

const skillPayloadSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    version: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    format: { enum: SKILL_FORMATS as unknown as string[] },
    content: { type: 'string' },
    checksum: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    requires_approval: { type: 'boolean' },
  },
  required: ['name', 'version', 'format', 'content', 'checksum'],
  additionalProperties: true,
}

interface ListQuery {
  format?: string
  limit?: number
}

interface IdParams {
  id: string
}

export default async function skillsRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Querystring: ListQuery }>(
    '/v1/skills',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            format: { enum: SKILL_FORMATS as unknown as string[] },
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
          },
        },
      },
    },
    async (req) => {
      const { format, limit } = req.query
      return listByType(daemon.view, 'skill', {
        limit,
        filter: format ? (v) => v?.payload?.format === format : undefined,
      })
    },
  )

  app.post('/v1/skills', { schema: { body: skillPayloadSchema } }, async (req) => {
    const payload = req.body as Record<string, unknown>
    const content = payload.content as string
    const claimed = payload.checksum as string
    const actual = expectedChecksum(content)
    if (claimed !== actual) {
      throw new HttpError(
        400,
        'SKILL_CHECKSUM_MISMATCH',
        `checksum ${claimed} does not match sha256(content) ${actual}`,
      )
    }
    const timestamp = new Date().toISOString()
    const result = await daemon.append({
      type: 'skill',
      timestamp,
      agent_id: daemon.peerHandle!,
      payload,
    })
    return { id: result.id, timestamp }
  })

  app.get<{ Params: IdParams }>('/v1/skills/:id/content', async (req) => {
    const entry = await getById(daemon.view, 'skill', req.params.id)
    if (!entry) {
      throw new HttpError(404, 'NOT_FOUND', `skill ${req.params.id} not found`)
    }
    const stored = entry.payload.content as string
    const claimed = entry.payload.checksum as string
    const actual = expectedChecksum(stored)
    if (claimed !== actual) {
      throw new HttpError(
        500,
        'SKILL_CHECKSUM_MISMATCH',
        `stored content for skill ${req.params.id} does not match its recorded checksum`,
      )
    }
    return {
      id: entry.id,
      name: entry.payload.name,
      version: entry.payload.version,
      format: entry.payload.format,
      checksum: entry.payload.checksum,
      content: entry.payload.content,
    }
  })
}
