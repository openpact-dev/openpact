import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

/**
 * Vite config for the dashboard frontend.
 *
 * Tailwind v4 via the official Vite plugin (CSS-first config in
 * src/style.css, no postcss config needed). JSX → preact via
 * esbuild's automatic transform; we deliberately don't load
 * @preact/preset-vite (its hook-names plugin pulls in zimmerframe,
 * which only ships an "import" condition and breaks Vite's loader).
 * Cost: no Fast Refresh in dev — we live without HMR for v0.1.
 */
export default defineConfig({
  root: 'src',
  publicDir: '../public',
  plugins: [tailwindcss()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  build: {
    outDir: '../dist/browser',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 7667,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7666',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, '/v1'),
      },
    },
  },
})
