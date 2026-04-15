import { defineConfig } from 'vite'

/**
 * Vite config for the dashboard frontend.
 *
 * We deliberately don't load `@preact/preset-vite`. Its
 * transform-hook-names plugin requires `zimmerframe`, which only
 * ships an "import" condition in its exports map; under Vite's CJS
 * loader the require() blows up. Esbuild's automatic JSX transform
 * with `jsxImportSource: 'preact'` covers what we actually need:
 * JSX → preact.h, no Fast Refresh (we live without HMR for slice C/D).
 */
export default defineConfig({
  root: 'src',
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
