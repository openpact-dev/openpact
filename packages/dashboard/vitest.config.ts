import { defineConfig } from 'vitest/config'

/**
 * Vitest config for frontend hook tests. Deliberately doesn't load
 * @preact/preset-vite (its transform-hook-names plugin pulls in a dep
 * with broken ESM exports under vitest's loader). Esbuild's automatic
 * JSX transform with preact as the import source is enough — hooks
 * tests don't render real components, they exercise pure logic in a
 * jsdom environment.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/vitest/**/*.test.ts', 'test/vitest/**/*.test.tsx'],
    globals: false,
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
})
