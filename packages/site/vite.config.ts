import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

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
  plugins: [tailwindcss()],
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
        'docs-rest-api': src('docs/rest-api/index.html'),
        'docs-architecture': src('docs/architecture/index.html'),
        'for-agents': src('for-agents/index.html'),
        notFound: src('404.html'),
      },
    },
  },
  server: {
    port: 7668,
  },
})
