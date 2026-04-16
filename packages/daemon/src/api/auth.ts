import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify'
import crypto from 'crypto'
import { envelope } from './errors'

/**
 * Routes that skip both the bearer check and the Host/Origin check. We
 * keep this set tiny on purpose — liveness probes and the bootstrap
 * ping are the only endpoints a supervisor / dashboard-load script
 * should ever need before it has a token.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/v1/ping', '/v1/healthz', '/v1/readyz'])

/**
 * Allowed Host header values. The daemon only binds to loopback (see
 * api/bind.ts), so a legitimate request always presents a localhost
 * Host. Anything else is DNS-rebinding or a misrouted proxy — refuse
 * before the body is parsed.
 */
const HOST_ALLOW_RE = /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d{1,5})?$/i

function isPublicPath(url: string): boolean {
  // Strip query string.
  const path = url.split('?', 1)[0]
  return PUBLIC_PATHS.has(path)
}

function isAllowedHost(host: string | undefined): boolean {
  if (!host) return false
  return HOST_ALLOW_RE.test(host.trim())
}

function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true // No Origin header — same-origin tool (CLI, curl). Fine.
  try {
    const u = new URL(origin)
    // Derive the allowed host from the Host header — the Origin must
    // point at the same localhost the request was sent to. This means
    // a page served from anywhere but `http://127.0.0.1:<port>` cannot
    // drive the daemon, even via DNS rebinding (rebinding only changes
    // resolution, not the Origin string the browser stamps).
    if (!isAllowedHost(u.host)) return false
    return !host || u.host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

export interface AuthOpts {
  token: string
}

/**
 * Produce the Fastify onRequest hook that enforces:
 *   1. Host header is loopback (DNS-rebinding shield).
 *   2. Origin header, if present, is loopback and matches Host.
 *   3. `Authorization: Bearer <token>` matches the daemon's minted
 *      token using a constant-time comparison.
 *
 * Skips all three for paths in PUBLIC_PATHS.
 */
export function makeAuthHook({ token }: AuthOpts): onRequestHookHandler {
  if (!token) throw new Error('makeAuthHook: token is required')
  const tokenBuf = Buffer.from(token, 'utf8')

  return async function authHook(req: FastifyRequest, reply: FastifyReply) {
    if (isPublicPath(req.url)) return

    const host = (req.headers.host as string | undefined) || undefined
    if (!isAllowedHost(host)) {
      reply
        .code(403)
        .send(envelope(403, 'FORBIDDEN_HOST', `Host header ${host ?? '<missing>'} is not loopback`))
      return reply
    }

    const origin = (req.headers.origin as string | undefined) || undefined
    if (!isAllowedOrigin(origin, host)) {
      reply
        .code(403)
        .send(
          envelope(
            403,
            'FORBIDDEN_ORIGIN',
            `Origin ${origin ?? '<missing>'} is not loopback or does not match Host`,
          ),
        )
      return reply
    }

    const header = (req.headers.authorization as string | undefined) || ''
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (!match) {
      reply
        .code(401)
        .send(envelope(401, 'UNAUTHORIZED', 'missing Bearer token; set Authorization header'))
      return reply
    }
    const presented = Buffer.from(match[1].trim(), 'utf8')
    if (presented.length !== tokenBuf.length || !crypto.timingSafeEqual(presented, tokenBuf)) {
      reply.code(401).send(envelope(401, 'UNAUTHORIZED', 'invalid Bearer token'))
      return reply
    }
    // OK — fall through to the route handler.
  }
}

// Exported for tests.
export const __testing = { PUBLIC_PATHS, HOST_ALLOW_RE, isAllowedHost, isAllowedOrigin }
