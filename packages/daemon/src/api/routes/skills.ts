import { createHash } from 'crypto'
import { mkdir, readFile, writeFile, rename } from 'fs/promises'
import path from 'path'
import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import type { Pact } from '../../pact'
import { listByType, getById } from '../views'
import { HttpError } from '../errors'
import { resolvePact } from '../pact-resolver'

const SKILL_FORMATS = ['openclaw', 'langchain', 'generic'] as const
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/
const FORMAT_EXT: Record<string, string> = {
  openclaw: 'md',
  langchain: 'py',
  generic: 'txt',
}

function expectedChecksum(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}

function skillsDir(pact: Pact): string {
  return path.join(pact.dataDir, 'skills')
}

function installedManifestPath(pact: Pact): string {
  return path.join(pact.dataDir, 'installed-skills.json')
}

interface InstalledRecord {
  path: string
  installed_at: string
  checksum: string
  name: string
  version: string
  format: string
}

async function readInstalled(pact: Pact): Promise<Record<string, InstalledRecord>> {
  try {
    return JSON.parse(await readFile(installedManifestPath(pact), 'utf8'))
  } catch (err: any) {
    if (err?.code === 'ENOENT') return {}
    throw err
  }
}

async function writeInstalled(
  pact: Pact,
  manifest: Record<string, InstalledRecord>,
): Promise<void> {
  const target = installedManifestPath(pact)
  const tmp = `${target}.tmp`
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(tmp, JSON.stringify(manifest, null, 2))
  await rename(tmp, target)
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
  pactId: string
  id: string
}

export default async function skillsRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Params: { pactId: string }; Querystring: ListQuery }>(
    '/v1/pacts/:pactId/skills',
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
      const pact = await resolvePact(daemon, req)
      const { format, limit } = req.query
      return listByType(pact.view, 'skill', {
        limit,
        filter: format ? (v) => v?.payload?.format === format : undefined,
      })
    },
  )

  app.post<{ Params: { pactId: string } }>(
    '/v1/pacts/:pactId/skills',
    { schema: { body: skillPayloadSchema } },
    async (req) => {
      const pact = await resolvePact(daemon, req)
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
      const result = await pact.append({
        type: 'skill',
        timestamp,
        agent_id: pact.peerHandle!,
        display_name: pact.displayName,
        payload,
      })
      return { id: result.id, timestamp }
    },
  )

  app.get<{ Params: IdParams }>('/v1/pacts/:pactId/skills/:id/content', async (req) => {
    const pact = await resolvePact(daemon, req)
    const entry = await getById(pact.view, 'skill', req.params.id)
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

  app.get<{ Params: { pactId: string } }>('/v1/pacts/:pactId/skills/installed', async (req) => {
    const pact = await resolvePact(daemon, req)
    const manifest = await readInstalled(pact)
    return Object.entries(manifest).map(([id, record]) => ({ id, ...record }))
  })

  app.post<{ Params: IdParams; Body: { confirm?: boolean } }>(
    '/v1/pacts/:pactId/skills/:id/install',
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
      if (req.body.confirm !== true) {
        throw new HttpError(
          400,
          'NOT_CONFIRMED',
          'install requires explicit { "confirm": true } in the request body',
        )
      }

      const pact = await resolvePact(daemon, req)
      const entry = await getById(pact.view, 'skill', req.params.id)
      if (!entry) {
        throw new HttpError(404, 'NOT_FOUND', `skill ${req.params.id} not found`)
      }

      const name = entry.payload.name as string
      const version = entry.payload.version as string
      const format = entry.payload.format as string
      const content = entry.payload.content as string
      const claimedChecksum = entry.payload.checksum as string

      if (!SKILL_NAME_RE.test(name) || !SKILL_NAME_RE.test(version)) {
        throw new HttpError(
          400,
          'BAD_SKILL_NAME',
          `name and version must match ${SKILL_NAME_RE.source}; got name=${JSON.stringify(name)}, version=${JSON.stringify(version)}`,
        )
      }
      const ext = FORMAT_EXT[format]
      if (!ext) {
        throw new HttpError(400, 'BAD_REQUEST', `unknown skill format ${format}`)
      }

      const actualChecksum = expectedChecksum(content)
      if (claimedChecksum !== actualChecksum) {
        throw new HttpError(
          500,
          'SKILL_CHECKSUM_MISMATCH',
          `stored content for skill ${req.params.id} does not match its recorded checksum`,
        )
      }

      const dir = skillsDir(pact)
      await mkdir(dir, { recursive: true })
      const filename = `${name}@${version}.${ext}`
      const target = path.join(dir, filename)
      const tmp = `${target}.tmp`
      await writeFile(tmp, content, { mode: 0o644 })
      await rename(tmp, target)

      const installedAt = new Date().toISOString()
      const manifest = await readInstalled(pact)
      manifest[entry.id as string] = {
        path: target,
        installed_at: installedAt,
        checksum: claimedChecksum,
        name,
        version,
        format,
      }
      await writeInstalled(pact, manifest)

      return {
        ok: true,
        id: entry.id,
        path: target,
        installed_at: installedAt,
      }
    },
  )
}
