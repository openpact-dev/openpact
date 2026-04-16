#!/usr/bin/env node
/**
 * Post-process dist/esm/ so it's a valid Node ESM package.
 *
 * See packages/sdk/scripts/finalise-esm.mjs for the rationale. Kept as
 * a per-package copy (rather than a shared workspace script) so each
 * publishable package ships without needing sibling packages present
 * at build time.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ESM_DIR = join(HERE, '..', 'dist', 'esm')

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
