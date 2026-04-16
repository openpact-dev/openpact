import path from 'path'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyHttpProxy from '@fastify/http-proxy'

export interface StartDashboardOpts {
  /** Port the daemon's REST API is bound on. Default 7666. */
  daemonPort?: number
  /** Daemon host. Default 127.0.0.1. */
  daemonHost?: string
  /**
   * Bearer token the daemon requires on its REST API. The dashboard
   * injects `Authorization: Bearer <token>` into every proxied request
   * so the browser never sees or handles the credential. Required in
   * production; optional for tests that stub the upstream.
   */
  daemonToken?: string | null
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
  // The Vite build always lands at <package-root>/dist/browser. Two
  // runtime layouts to support:
  //   - source via tsx: __dirname = <pkg>/server  → ../dist/browser
  //   - built CJS:      __dirname = <pkg>/dist/server → ../browser
  // Try both; return whichever exists. Falls back to the source layout
  // (which is the canonical answer) when neither does.
  const candidates = [
    path.resolve(__dirname, '..', 'dist', 'browser'),
    path.resolve(__dirname, '..', 'browser'),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
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

  const app = Fastify({
    logger: opts.silent === false ? true : false,
    // SSE streams from the SPA keep sockets open indefinitely. Without
    // forceCloseConnections, `app.close()` blocks forever on shutdown.
    forceCloseConnections: true,
  })

  // Proxy /api/* straight through to the daemon. The SDK's resource
  // paths already include the `/v1/` prefix, so the client's request
  // URL looks like `/api/v1/knowledge`; the proxy strips only `/api`,
  // sending `/v1/knowledge` upstream. SSE works because replyOptions
  // streams the upstream response; proxyPayloads:false bypasses body
  // parsing so POST/PUT bodies stream too.
  const daemonToken = opts.daemonToken ?? null
  await app.register(fastifyHttpProxy, {
    upstream: `http://${daemonHost}:${daemonPort}`,
    prefix: '/api',
    rewritePrefix: '',
    proxyPayloads: false,
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    // Inject the daemon's bearer token server-side so it never reaches
    // the browser. Also drop browser-stamped Origin/Referer: the daemon's
    // DNS-rebinding shield requires Origin.host === Host.host, but the
    // browser's Origin is the dashboard port (7667) while this proxy
    // forwards to the daemon port (7666). Stripping them makes the hop
    // look like any other server-side caller (curl, the CLI), which is
    // what it is.
    replyOptions: {
      rewriteRequestHeaders: (_req, headers) => {
        const { origin: _o, referer: _r, ...rest } = headers
        const out: Record<string, unknown> = { ...rest }
        if (daemonToken) out.authorization = `Bearer ${daemonToken}`
        return out as typeof headers
      },
    },
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
    // SPA fallback: any unknown GET that isn't /api/* serves index.html
    // so client-side routes (`/knowledge`, `/trace/:id`, …) work on
    // direct navigation. The static handler already serves index.html
    // for `/`; this just extends it to any non-asset path.
    // SPA fallback: GETs that miss the static mount fall back to
    // index.html so client-side routes (`/knowledge`, `/trace/:id`,
    // …) work on direct navigation. decorateReply: false on the
    // static plugin leaves reply.sendFile undefined, so we read the
    // file per request and send the body directly. Re-reading keeps
    // the served HTML in sync with the current build without needing
    // to restart the daemon after `npm run -w @openpact/dashboard build`.
    const indexPath = path.join(staticDir, 'index.html')
    app.setNotFoundHandler(async (req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api')) {
        reply
          .status(404)
          .header('content-type', 'application/json')
          .send({
            error: 'NOT_FOUND',
            message: `route ${req.method} ${req.url} not found`,
            status: 404,
          })
        return
      }
      const html = await readFile(indexPath, 'utf8')
      // index.html pins hashed asset URLs. If the browser caches it,
      // a rebuild (new hash) can't reach users until they hard-refresh.
      // Asset files have hashed names and can be cached forever; the
      // HTML shell must not.
      reply
        .header('content-type', 'text/html; charset=utf-8')
        .header('cache-control', 'no-cache, no-store, must-revalidate')
        .send(html)
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
