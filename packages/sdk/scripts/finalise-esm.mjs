#!/usr/bin/env node
/**
 * Post-process the dist/esm/ tree so it's a valid Node ESM package.
 *
 * Two things to do:
 *   1. Add `.js` to every relative import/export specifier. TypeScript
 *      with `module: es2022` + `moduleResolution: node` leaves bare
 *      relative imports (`from './client'`) untouched, but Node ESM
 *      requires explicit extensions in import specifiers. We rewrite
 *      `from './foo'` and `from './foo/bar'` → `from './foo.js'` /
 *      `from './foo/bar.js'`, skipping anything already extensioned
 *      and anything starting with a non-dot character (bare module
 *      specifiers stay alone).
 *   2. Drop a `dist/esm/package.json` containing `{"type":"module"}`
 *      so Node treats the .js files in this folder as ESM, even
 *      though the SDK package itself is `"type":"commonjs"`.
 *
 * The CJS build needs neither of these — Node CJS happily resolves
 * extensionless requires, and dist/cjs/ inherits the package's
 * commonjs type by default.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ESM_DIR = join(HERE, '..', 'dist', 'esm')

// `from '...'` and `import('...')` for both static and dynamic.
// Matches in both .js and .d.ts (which use the same syntax for type-only
// imports like `import type X from './foo'`).
const SPEC_RE = /(from\s+|import\(\s*)(['"])(\.{1,2}\/[^'"]+?)\2/g

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry)
    const st = await stat(full)
    if (st.isDirectory()) out.push(...(await walk(full)))
    else if (entry.endsWith('.js') || entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

async function isDir(p) {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function rewrite(src, fromFile) {
  const dir = dirname(fromFile)
  const matches = [...src.matchAll(SPEC_RE)]
  if (!matches.length) return src
  const replacements = await Promise.all(
    matches.map(async (m) => {
      const [match, prefix, quote, spec] = m
      if (/\.(m?js|json)$/.test(spec)) return { match, replacement: match }
      const abs = resolve(dir, spec)
      const finalSpec = (await isDir(abs)) ? `${spec}/index.js` : `${spec}.js`
      return { match, replacement: `${prefix}${quote}${finalSpec}${quote}` }
    }),
  )
  let i = 0
  return src.replace(SPEC_RE, () => replacements[i++].replacement)
}

async function main() {
  const files = await walk(ESM_DIR)
  let changed = 0
  for (const file of files) {
    const before = await readFile(file, 'utf8')
    const after = await rewrite(before, file)
    if (after !== before) {
      await writeFile(file, after)
      changed++
    }
  }
  await writeFile(join(ESM_DIR, 'package.json'), '{"type":"module"}\n')
  process.stdout.write(
    `finalise-esm: rewrote ${changed}/${files.length} files; wrote dist/esm/package.json\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`finalise-esm: ${err.stack || err}\n`)
  process.exit(1)
})
