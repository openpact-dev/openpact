/**
 * Proves that the published dual-build artefacts actually load from
 * Node under both module systems. Catches regressions in:
 *   - exports map shape (publint already gates, but a real
 *     `import`/`require` is the only test that runs the resolver
 *     against the on-disk files)
 *   - finalise-esm.mjs rewrite (missing .js → ESM resolver fails
 *     loudly here, not silently in some downstream consumer)
 *   - dist/esm/package.json shim (without it, Node treats .js as
 *     CJS and the import fails)
 *
 * Build must have been run before this test (CI does
 * `npm run -w @openpact/sdk build` as part of `test:all`).
 */
import test from 'brittle'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const run = promisify(execFile)
const SDK = path.resolve(__dirname, '..', '..')
const CJS_ENTRY = path.join(SDK, 'dist', 'cjs', 'index.js')
const ESM_ENTRY = path.join(SDK, 'dist', 'esm', 'index.js')

async function distExists(): Promise<boolean> {
  try {
    await fs.access(CJS_ENTRY)
    await fs.access(ESM_ENTRY)
    return true
  } catch {
    return false
  }
}

test('dual-build: dist/ exists (skipping if not built)', async (t) => {
  if (!(await distExists())) {
    t.pass('dist/ not built; skipping (run `npm run -w @openpact/sdk build` first)')
    return
  }
  t.pass('dist/cjs and dist/esm both present')
})

test('dual-build: CJS entry loads via require()', async (t) => {
  if (!(await distExists())) return t.pass('dist/ not built; skipped')
  const { stdout } = await run('node', [
    '-e',
    `const sdk = require('${CJS_ENTRY}'); console.log(JSON.stringify(Object.keys(sdk).sort()))`,
  ])
  const keys = JSON.parse(stdout.trim())
  t.ok(keys.includes('OpenPact'), 'OpenPact exported')
  t.ok(keys.includes('TaskNotOpenError'), 'TaskNotOpenError exported')
  t.ok(keys.includes('SkillChecksumMismatchError'), 'SkillChecksumMismatchError exported')
})

test('dual-build: ESM entry loads via import', async (t) => {
  if (!(await distExists())) return t.pass('dist/ not built; skipped')
  const { stdout } = await run('node', [
    '--input-type=module',
    '-e',
    `import * as sdk from ${JSON.stringify(ESM_ENTRY)}; console.log(JSON.stringify(Object.keys(sdk).sort()))`,
  ])
  const keys = JSON.parse(stdout.trim())
  t.ok(keys.includes('OpenPact'), 'OpenPact exported')
  t.ok(keys.includes('TaskNotOpenError'), 'TaskNotOpenError exported')
  t.ok(keys.includes('SkillChecksumMismatchError'), 'SkillChecksumMismatchError exported')
})

test('dual-build: ESM entry instantiates and has the right baseUrl', async (t) => {
  if (!(await distExists())) return t.pass('dist/ not built; skipped')
  const { stdout } = await run('node', [
    '--input-type=module',
    '-e',
    `import { OpenPact } from ${JSON.stringify(ESM_ENTRY)}; console.log(new OpenPact({ port: 9999 }).baseUrl)`,
  ])
  t.is(stdout.trim(), 'http://127.0.0.1:9999')
})

test('dual-build: dist/esm/package.json declares "type":"module"', async (t) => {
  if (!(await distExists())) return t.pass('dist/ not built; skipped')
  const pkg = JSON.parse(await fs.readFile(path.join(SDK, 'dist', 'esm', 'package.json'), 'utf8'))
  t.is(pkg.type, 'module')
})

test('dual-build: ESM source has .js extensions on relative imports', async (t) => {
  if (!(await distExists())) return t.pass('dist/ not built; skipped')
  const indexSrc = await fs.readFile(ESM_ENTRY, 'utf8')
  const bareRelativeImports = indexSrc.match(/from\s+['"]\.[^'"]*['"]/g) ?? []
  for (const m of bareRelativeImports) {
    t.ok(/\.(js|json)['"]$/.test(m), `${m} ends with an extension`)
  }
})
