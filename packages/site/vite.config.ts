import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

/**
 * Directory-based HTML entries in our MPA (/join, /docs, /for-agents,
 * /docs/getting-started, …) only match when the URL carries a trailing
 * slash — otherwise Vite falls back to the landing page. Shared invite
 * links in the wild often drop the slash, so redirect them here.
 * Production static hosts (Cloudflare Pages, nginx) are happy either
 * way; this plugin only matters in `vite dev`.
 */
const DIRECTORY_ROUTES = new Set([
  '/join',
  '/docs',
  '/docs/getting-started',
  '/docs/cli',
  '/docs/dashboard',
  '/docs/rest-api',
  '/docs/architecture',
  '/docs/packages',
  '/docs/skill',
  '/docs/examples',
  '/for-agents',
])

function trailingSlashRedirect(): Plugin {
  return {
    name: 'openpact-trailing-slash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        const [path, query] = req.url.split('?')
        if (!DIRECTORY_ROUTES.has(path)) return next()
        const target = path + '/' + (query ? '?' + query : '')
        res.statusCode = 301
        res.setHeader('location', target)
        res.end()
      })
    },
  }
}

/**
 * Vite config for openpact.dev.
 *
 * Pure static MPA: each route is a separate HTML entry under src/.
 * Tailwind v4 via the official Vite plugin (CSS-first @theme config
 * in src/style.css, no postcss config). JSX → preact via esbuild's
 * automatic transform; we deliberately don't load @preact/preset-vite
 * (its hook-names plugin pulls in zimmerframe, which only ships an
 * "import" condition and breaks Vite's loader).
 */
const src = (p: string) => resolve(__dirname, 'src', p)

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  plugins: [trailingSlashRedirect(), tailwindcss()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        landing: src('index.html'),
        join: src('join/index.html'),
        docs: src('docs/index.html'),
        'docs-getting-started': src('docs/getting-started/index.html'),
        'docs-cli': src('docs/cli/index.html'),
        'docs-dashboard': src('docs/dashboard/index.html'),
        'docs-rest-api': src('docs/rest-api/index.html'),
        'docs-architecture': src('docs/architecture/index.html'),
        'docs-packages': src('docs/packages/index.html'),
        'docs-skill': src('docs/skill/index.html'),
        'docs-examples': src('docs/examples/index.html'),
        'for-agents': src('for-agents/index.html'),
        notFound: src('404.html'),
      },
    },
  },
  server: {
    port: 7668,
  },
})
