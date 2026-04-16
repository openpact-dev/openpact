import fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import type { Daemon } from '../daemon'
import { errorHandler, envelope, HttpError } from './errors'
import { ERROR_CODES } from '../error-codes'
import { makeAuthHook } from './auth'
import pingRoute from './routes/ping'
import statusRoute from './routes/status'
import peersRoute from './routes/peers'
import knowledgeRoute from './routes/knowledge'
import messagesRoute from './routes/messages'
import skillsRoute from './routes/skills'
import tasksRoute from './routes/tasks'
import adminRoute from './routes/admin'
import entriesRoute from './routes/entries'
import eventsRoute from './routes/events'
import pactsRoute from './routes/pacts'
import invitesRoute from './routes/invites'
import healthRoute, { installSseMetrics } from './routes/health'

export { HttpError, type ErrorEnvelope } from './errors'
export { bind, DEFAULT_PORT, type BindOpts } from './bind'
export { makeAuthHook } from './auth'

export interface ApiOpts {
  /**
   * Pass a Pino logger instance (preferred) or `true` to let Fastify
   * spin up its own. Defaults to `false` (silent) so unit tests stay
   * quiet — production callers pass the daemon's shared logger via
   * `createLogger`.
   */
  logger?: boolean | object
  /**
   * Bearer token required on every non-public route. When omitted,
   * auth is disabled entirely — used by unit tests that boot the API
   * on an ephemeral port. Callers in production (daemon startup,
   * start-foreground) must always pass a token from `ensureApiToken`.
   */
  token?: string | null
  /**
   * Maximum request body size in bytes. Defaults to 128KiB — comfortably
   * above the 64KiB `MAX_PAYLOAD_BYTES` entry limit while still
   * bounding pathological agents. Body limits apply before any route
   * handler runs, so oversized payloads never touch Autobase.
   */
  bodyLimit?: number
  /**
   * Per-IP rate-limit budget. Localhost is trusted but the API is
   * exposed to any process on the machine — a runaway script that
   * floods /v1/* must not starve legitimate SDK traffic. Defaults are
   * generous (600 requests / minute) and can be raised/lowered at
   * boot. Set `max` to 0 to disable entirely.
   */
  rateLimit?: {
    max?: number
    windowMs?: number
  }
  /**
   * Milliseconds the HTTP server waits for the full request line +
   * headers before dropping the socket. Applied via Fastify's
   * `connectionTimeout`. Default: 30s.
   */
  connectionTimeout?: number
  /**
   * Milliseconds an idle keep-alive socket is allowed to linger
   * before the server closes it. Default: 5s — short because every
   * SDK client is local and a reopened socket is cheap.
   */
  keepAliveTimeout?: number
  /**
   * Milliseconds to wait for the complete request body. Default:
   * 30s. Guards against slowloris-style clients that drip-feed a
   * body within the overall connection timeout.
   */
  requestTimeout?: number
}

export const DEFAULT_BODY_LIMIT = 128 * 1024
// 3000 req/min = 50 req/s sustained per IP. Polled-status UIs and
// long-running agent scripts comfortably fit under this ceiling
// while a runaway loop (1000s of req/s) still trips the limiter.
export const DEFAULT_RATE_LIMIT_MAX = 3_000
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000
export const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000
export const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5_000
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export function createApi(daemon: Daemon, opts: ApiOpts = {}): FastifyInstance {
  // Fastify 5 split logger config in two: pass `loggerInstance` for an
  // already-built Pino logger, or `logger: true|object` for "make me one".
  // Mixing the two is an error.
  const baseOpts = {
    bodyLimit: opts.bodyLimit ?? DEFAULT_BODY_LIMIT,
    // /v1/events is SSE; those sockets never drain on their own. Without
    // forceCloseConnections, app.close() hangs during shutdown until the
    // CLI's SIGKILL fallback fires.
    forceCloseConnections: true,
    connectionTimeout: opts.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    keepAliveTimeout: opts.keepAliveTimeout ?? DEFAULT_KEEP_ALIVE_TIMEOUT_MS,
    requestTimeout: opts.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
  }
  let app: FastifyInstance
  if (opts.logger === true) {
    app = fastify({ ...baseOpts, logger: true })
  } else if (opts.logger && typeof opts.logger === 'object') {
    // Fastify 5 wants `loggerInstance` for a pre-built Pino logger; the
    // type signature insists on the exact pino type so we widen via
    // `unknown` rather than depend on pino types in the API surface.
    const withInstance = { ...baseOpts, loggerInstance: opts.logger } as unknown as Parameters<
      typeof fastify
    >[0]
    app = fastify(withInstance) as unknown as FastifyInstance
  } else {
    app = fastify({ ...baseOpts, logger: false })
  }
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler((req, reply) => {
    reply
      .status(404)
      .send(envelope(404, ERROR_CODES.NOT_FOUND, `route ${req.method} ${req.url} not found`))
  })
  // Rate-limit localhost callers per IP. Every route inherits the
  // global policy; opting individual routes out (e.g. SSE long-polls)
  // can be done via `config.rateLimit.max = 0` in the route declaration.
  const rlMax = opts.rateLimit?.max ?? DEFAULT_RATE_LIMIT_MAX
  const rlWindow = opts.rateLimit?.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS
  if (rlMax > 0) {
    app.register(rateLimit, {
      global: true,
      max: rlMax,
      timeWindow: rlWindow,
      // The plugin `throws` whatever errorResponseBuilder returns, so
      // we hand it a proper HttpError — our errorHandler then maps it
      // to the canonical { error, message, status } envelope so SDK
      // clients don't need a special case for rate-limit responses.
      errorResponseBuilder: (_req, ctx) =>
        new HttpError(
          429,
          ERROR_CODES.RATE_LIMITED,
          `rate limit exceeded: ${ctx.max} requests per ${Math.round(ctx.ttl)}ms — retry in ${Math.ceil(
            ctx.ttl / 1000,
          )}s`,
        ),
    })
  }
  // Auth + Host/Origin guard. Token-less mode is test-only.
  if (opts.token) {
    app.addHook('onRequest', makeAuthHook({ token: opts.token }))
  }
  installSseMetrics(daemon)
  const startedAt = Date.now()
  app.register(pingRoute, { daemon })
  app.register(healthRoute, { daemon, startedAt })
  app.register(statusRoute, { daemon })
  app.register(pactsRoute, { daemon })
  app.register(peersRoute, { daemon })
  app.register(knowledgeRoute, { daemon })
  app.register(messagesRoute, { daemon })
  app.register(skillsRoute, { daemon })
  app.register(tasksRoute, { daemon })
  app.register(adminRoute, { daemon })
  app.register(invitesRoute, { daemon })
  app.register(entriesRoute, { daemon })
  app.register(eventsRoute, { daemon })
  return app
}
