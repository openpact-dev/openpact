import path from 'path'
import { existsSync } from 'fs'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyHttpProxy from '@fastify/http-proxy'

export interface StartDashboardOpts {
  /** Port the daemon's REST API is bound on. Default 7666. */
  daemonPort?: number
  /** Daemon host. Default 127.0.0.1. */
  daemonHost?: string
  /** Port to bind the dashboard server on. Default 7667. Pass 0 for an OS-chosen free port. */
  port?: number
  /** Host to bind. Default 127.0.0.1. Whitelisted to localhost variants. */
  host?: string
  /**
   * Override the directory served as static assets. Defaults to
   * `dist/browser/` next to the built server entry. Useful in tests.
   */
  staticDir?: string
  /** Pass true to disable Fastify's request log. */
  silent?: boolean
}

export interface StartDashboardResult {
  app: FastifyInstance
  url: string
  port: number
  close(): Promise<void>
}

const ALLOWED_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

function defaultStaticDir(): string {
  // The compiled server entry lives in dist/server/index.js; the browser
  // build sits at dist/browser/. In dev/tests, run `vite build` first
  // so this path exists; otherwise pass `staticDir` explicitly.
  return path.resolve(__dirname, '..', 'browser')
}

/**
 * Boot a Fastify instance that serves the built dashboard SPA and
 * proxies /api/* to the daemon's REST API.
 *
 * Returns the bound URL plus a close() helper. The daemon is referenced
 * only by host/port — we don't need a Daemon instance handle here
 * because the server is purely an HTTP proxy + static file mount.
 */
export async function startDashboard(opts: StartDashboardOpts = {}): Promise<StartDashboardResult> {
  const daemonPort = opts.daemonPort ?? 7666
  const daemonHost = opts.daemonHost ?? '127.0.0.1'
  const port = opts.port ?? 7667
  const host = opts.host ?? '127.0.0.1'
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`dashboard host must be 127.0.0.1, ::1, or localhost; got ${host}`)
  }

  const app = Fastify({ logger: opts.silent === false ? true : false })

  // Proxy /api/* to the daemon's /v1/*. Same-origin from the browser's
  // perspective; no CORS in play. The default replyOptions stream
  // upstream responses, which matters for /api/events SSE (the daemon
  // writes frames; the proxy must pass them through unbuffered).
  // proxyPayloads: false bypasses Fastify's body parser so request
  // bodies stream too.
  await app.register(fastifyHttpProxy, {
    upstream: `http://${daemonHost}:${daemonPort}`,
    prefix: '/api',
    rewritePrefix: '/v1',
    proxyPayloads: false,
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })

  // Static SPA. Only mount when the build output exists; otherwise the
  // server is a proxy-only useful for tests.
  const staticDir = opts.staticDir ?? defaultStaticDir()
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      // Don't decorate; we may register multiple static layers in tests.
      decorateReply: false,
    })
  }

  const boundUrl = await app.listen({ port, host })
  const actualPort = (app.server.address() as { port: number }).port

  return {
    app,
    url: boundUrl,
    port: actualPort,
    close: () => app.close(),
  }
}
