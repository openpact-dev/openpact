#!/usr/bin/env tsx
// Prerender every route into its built HTML shell so every page is
// fully readable before JS runs. WebFetch, curl, archive crawlers,
// and AI agents see the real content, not an empty #app div.
// Runs after `vite build`.

import { h, type ComponentType } from 'preact'
import { renderToString } from 'preact-render-to-string'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ROUTES, type Route } from './route-manifest.mts'

const here = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(here, '..')
const distDir = resolve(siteRoot, 'dist')

const APP_MOUNT = /<div id="app"><\/div>/

async function renderRoute(route: Route): Promise<void> {
  const modUrl = pathToFileURL(resolve(siteRoot, route.module)).href
  const mod = (await import(modUrl)) as Record<string, unknown>
  const Component = mod[route.export] as ComponentType | undefined
  if (typeof Component !== 'function') {
    throw new Error(`prerender: missing export ${route.export} in ${route.module}`)
  }

  const rendered = renderToString(h(Component, {}))
  const shellPath = resolve(distDir, route.distHtml)
  const shell = await readFile(shellPath, 'utf8')
  if (!APP_MOUNT.test(shell)) {
    throw new Error(
      `prerender: ${route.distHtml} does not contain <div id="app"></div>. ` +
        `The HTML shell must expose that exact mount point.`,
    )
  }
  const injected = shell.replace(APP_MOUNT, `<div id="app">${rendered}</div>`)
  await writeFile(shellPath, injected)
  process.stdout.write(`  ✓ ${route.url} -> ${route.distHtml}\n`)
}

async function main(): Promise<void> {
  const prerenderable = ROUTES.filter((r) => r.prerender !== false)
  const skipped = ROUTES.length - prerenderable.length
  process.stdout.write(
    `prerender: ${prerenderable.length} routes${skipped ? ` (${skipped} skipped)` : ''}\n`,
  )
  for (const route of ROUTES) {
    if (route.prerender === false) {
      process.stdout.write(`  - ${route.url} (skipped, render-only)\n`)
      continue
    }
    await renderRoute(route)
  }
  process.stdout.write(`prerender: done\n`)
}

main().catch((err) => {
  process.stderr.write(`prerender failed: ${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
