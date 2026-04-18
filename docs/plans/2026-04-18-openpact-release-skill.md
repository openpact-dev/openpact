# `/openpact-release` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tooling (release script, GitHub Actions workflow, skill file) that lets the operator run `/openpact-release <version>` and ship all six public OpenPact packages to npmjs.org in lockstep.

**Architecture:** The release script (`scripts/release/index.ts`) is a deterministic mechanical tool: bump versions, rewrite changelog, commit, tag. The skill (`.claude/skills/openpact-release/SKILL.md`) is the interactive checklist that curates changelog content, invokes the script, and handles the push and verify steps. A GitHub Actions workflow triggered on `v*` tags runs the tests one more time, publishes each package with npm provenance, and creates the GitHub Release.

**Tech Stack:** TypeScript, `tsx` for script execution, `brittle` for tests (matches rest of repo), GitHub Actions with `actions/setup-node@v4` and `id-token: write` for provenance, `gh` CLI for release creation.

---

## Context the engineer needs

- Monorepo with npm workspaces. Node 22+. All source is `.ts` run via `tsx`, no transpile step for scripts.
- Test runner is `brittle` (like node:test). Unit tests live alongside source under `test/unit/*.test.ts`. Invoked via `NODE_OPTIONS='--import tsx' brittle <glob>`.
- Six public packages to bump and publish: `@openpact/daemon`, `@openpact/sdk`, `@openpact/mcp`, `@openpact/skill`, `@openpact/dashboard`, `openpact`. Plus `@openpact/site` gets its `version` bumped (stays private, not published).
- Internal workspace dependencies use the `"*"` specifier (e.g. `@openpact/mcp` depends on `@openpact/sdk: "*"`). These must be rewritten to `"^<version>"` at release time so the published tarballs resolve on consumer machines.
- Project conventions from `CLAUDE.md`: no em-dashes in prose, no marketing voice, short sentences. UI text starts with a capital letter.
- Spec: `docs/specs/2026-04-18-openpact-release-skill.md`. Read it first.

## File structure

Files created:

- `CHANGELOG.md` (repo root). Keep-a-Changelog format. Seeded with populated `[Unreleased]` covering everything shipped so far.
- `packages/site/src/version.ts`. Single-source-of-truth for the badge shown in the site header.
- `scripts/release/index.ts`. Entry point. Orchestrates the release: argv, preflight, file mutations, git commit + tag.
- `scripts/release/lib/bump-package.ts`. Pure. Rewrites the top-level `"version"` field in a `package.json` string.
- `scripts/release/lib/update-workspace-deps.ts`. Pure. Rewrites `"@openpact/*": "*"` entries under `dependencies` to `"^<version>"`.
- `scripts/release/lib/promote-changelog.ts`. Pure. Promotes the top `## [Unreleased]` heading to `## [X.Y.Z] - YYYY-MM-DD` and inserts a fresh empty `## [Unreleased]` above.
- `scripts/release/lib/update-site-version.ts`. Pure. Rewrites the `SITE_VERSION` constant value in a `packages/site/src/version.ts` string.
- `scripts/release/test/bump-package.test.ts`
- `scripts/release/test/update-workspace-deps.test.ts`
- `scripts/release/test/promote-changelog.test.ts`
- `scripts/release/test/update-site-version.test.ts`
- `scripts/release/test/integration.test.ts`. Runs the script against a temp git repo.
- `.github/workflows/release.yml`. Triggered on `v*` tags.
- `.claude/skills/openpact-release/SKILL.md`. The checklist.

Files modified:

- `package.json` (root). Add `"release": "tsx scripts/release/index.ts"` script. Extend the brittle test glob so `scripts/release/test/*.test.ts` runs under `npm test`.
- `packages/site/src/components/Header.tsx`. Replace the literal `v0.1 alpha` badge text with the imported `SITE_VERSION`.
- `packages/site/src/docs/pages/Releases.tsx`. Import `SITE_VERSION` (not strictly required, but prevents drift). The existing `v0.1.0-alpha.1` entry stays untouched; the skill prepends the v0.1.0 entry interactively, not via the script.

---

## Task 1: Seed CHANGELOG.md at the repo root

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Draft the changelog content**

Read `docs/OPENPACT_BUILD_PLAN.md` (especially the "what's shipped" sections) and `packages/site/src/docs/pages/Releases.tsx` (the `v0.1.0-alpha.1` entry already reads like a release note). Use those to draft the v0.1.0 `[Unreleased]` bullets.

- [ ] **Step 2: Write `CHANGELOG.md`**

Write this exact structure, filling `[Unreleased]` with bullets derived from the sources above:

```markdown
# Changelog

All notable changes to OpenPact are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is lockstep across all public packages: one tag, one version across `@openpact/daemon`, `@openpact/sdk`, `@openpact/mcp`, `@openpact/skill`, `@openpact/dashboard`, and `openpact`.

## [Unreleased]

### Added

- Daemon core: Hypercore + Autobase + Hyperswarm + Hyperbee + Corestore, with a Fastify REST surface bound to localhost:7666.
- <remaining bullets derived from OPENPACT_BUILD_PLAN.md and Releases.tsx>

### Changed

- <bullets>

### Fixed

- <bullets>
```

Keep the `[Unreleased]` section populated: when the release script runs for v0.1.0, it promotes this section wholesale.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: seed CHANGELOG.md for the v0.1.0 release"
```

---

## Task 2: Introduce the site version constant

**Files:**
- Create: `packages/site/src/version.ts`
- Modify: `packages/site/src/components/Header.tsx`

- [ ] **Step 1: Create the constant**

`packages/site/src/version.ts`:

```typescript
// Source of truth for the version badge shown on the site. Updated by
// scripts/release/index.ts during the release flow.
export const SITE_VERSION = 'v0.1 alpha'
```

The value `'v0.1 alpha'` preserves the current header text for now. The release script overwrites it on every release.

- [ ] **Step 2: Wire it into the header**

Open `packages/site/src/components/Header.tsx`. At the top, add:

```typescript
import { SITE_VERSION } from '../version'
```

Replace the literal `v0.1 alpha` on line 36 with `{SITE_VERSION}`.

- [ ] **Step 3: Verify the site build still works**

Run: `npm run -w @openpact/site build`
Expected: completes without errors. `packages/site/dist/index.html` contains the badge text.

- [ ] **Step 4: Commit**

```bash
git add packages/site/src/version.ts packages/site/src/components/Header.tsx
git commit -m "site: extract SITE_VERSION so the header badge has one source"
```

---

## Task 3: Extend the brittle test glob to include `scripts/release/test/`

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update the `test` and `test:unit` scripts**

Current (from `package.json`):

```json
"test": "NODE_OPTIONS='--import tsx' brittle 'packages/*/test/{unit,integration}/**/*.test.ts'",
"test:unit": "NODE_OPTIONS='--import tsx' brittle 'packages/*/test/unit/**/*.test.ts'",
```

Change to:

```json
"test": "NODE_OPTIONS='--import tsx' brittle 'packages/*/test/{unit,integration}/**/*.test.ts' 'scripts/release/test/**/*.test.ts'",
"test:unit": "NODE_OPTIONS='--import tsx' brittle 'packages/*/test/unit/**/*.test.ts' 'scripts/release/test/**/*.test.ts'",
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "test: include scripts/release/test in the brittle glob"
```

---

## Task 4: Pure function — `bumpPackageVersion`

**Files:**
- Create: `scripts/release/lib/bump-package.ts`
- Create: `scripts/release/test/bump-package.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/release/test/bump-package.test.ts`:

```typescript
import test from 'brittle'
import { bumpPackageVersion } from '../lib/bump-package'

test('bumpPackageVersion rewrites the top-level version field', (t) => {
  const input = [
    '{',
    '  "name": "@openpact/sdk",',
    '  "version": "0.0.1",',
    '  "description": "x"',
    '}',
    '',
  ].join('\n')
  const expected = [
    '{',
    '  "name": "@openpact/sdk",',
    '  "version": "0.1.0",',
    '  "description": "x"',
    '}',
    '',
  ].join('\n')
  t.is(bumpPackageVersion(input, '0.1.0'), expected)
})

test('bumpPackageVersion preserves trailing newline and indentation', (t) => {
  const input = '{\n\t"version": "1.2.3"\n}\n'
  t.is(bumpPackageVersion(input, '1.2.4'), '{\n\t"version": "1.2.4"\n}\n')
})

test('bumpPackageVersion throws when there is no version field', (t) => {
  t.exception(() => bumpPackageVersion('{}', '0.1.0'), /no top-level version field/)
})

test('bumpPackageVersion only touches the top-level version, not nested ones', (t) => {
  const input = [
    '{',
    '  "version": "0.0.1",',
    '  "engines": { "node": ">=22" },',
    '  "dependencies": { "some-dep": "0.0.1" }',
    '}',
    '',
  ].join('\n')
  const out = bumpPackageVersion(input, '0.1.0')
  t.ok(out.includes('"version": "0.1.0"'))
  t.ok(out.includes('"some-dep": "0.0.1"'))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/bump-package.test.ts`
Expected: all tests fail because the module does not exist.

- [ ] **Step 3: Implement the minimal function**

`scripts/release/lib/bump-package.ts`:

```typescript
// Rewrites the top-level "version": "..." field in a package.json string.
// Preserves whitespace and ordering. Throws if the field is missing.
export function bumpPackageVersion(content: string, newVersion: string): string {
  // Match the first top-level `"version": "..."`. Top-level = at an
  // indentation depth of 1 (two spaces, four spaces, or one tab). We
  // anchor to line start so nested dependency versions are not matched.
  const re = /^(\s+"version":\s*")[^"]+(".*)$/m
  if (!re.test(content)) {
    throw new Error('no top-level version field in package.json')
  }
  return content.replace(re, `$1${newVersion}$2`)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/bump-package.test.ts`
Expected: all four tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/lib/bump-package.ts scripts/release/test/bump-package.test.ts
git commit -m "feat(release): pure bumpPackageVersion helper"
```

---

## Task 5: Pure function — `updateWorkspaceDependencies`

Internal workspace deps are specified as `"*"` (e.g. `"@openpact/sdk": "*"`). Those must become concrete `"^<version>"` in the published tarballs so consumers can resolve them.

**Files:**
- Create: `scripts/release/lib/update-workspace-deps.ts`
- Create: `scripts/release/test/update-workspace-deps.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/release/test/update-workspace-deps.test.ts`:

```typescript
import test from 'brittle'
import { updateWorkspaceDependencies } from '../lib/update-workspace-deps'

test('rewrites @openpact/* "*" entries under dependencies to caret range', (t) => {
  const input = [
    '{',
    '  "name": "@openpact/mcp",',
    '  "version": "0.1.0",',
    '  "dependencies": {',
    '    "@openpact/sdk": "*",',
    '    "@openpact/daemon": "*",',
    '    "external-thing": "^1.2.3"',
    '  }',
    '}',
    '',
  ].join('\n')
  const out = updateWorkspaceDependencies(input, '0.1.0')
  t.ok(out.includes('"@openpact/sdk": "^0.1.0"'))
  t.ok(out.includes('"@openpact/daemon": "^0.1.0"'))
  t.ok(out.includes('"external-thing": "^1.2.3"'))
})

test('leaves devDependencies alone', (t) => {
  const input = [
    '{',
    '  "devDependencies": {',
    '    "@openpact/daemon": "*"',
    '  }',
    '}',
    '',
  ].join('\n')
  const out = updateWorkspaceDependencies(input, '0.1.0')
  t.is(out, input)
})

test('noop when there are no @openpact/* deps', (t) => {
  const input = '{\n  "dependencies": { "foo": "^1.0.0" }\n}\n'
  t.is(updateWorkspaceDependencies(input, '0.1.0'), input)
})

test('noop when there is no dependencies block', (t) => {
  const input = '{\n  "name": "openpact"\n}\n'
  t.is(updateWorkspaceDependencies(input, '0.1.0'), input)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/update-workspace-deps.test.ts`
Expected: all tests fail, module missing.

- [ ] **Step 3: Implement**

`scripts/release/lib/update-workspace-deps.ts`:

```typescript
// Rewrites "@openpact/<name>": "*" entries inside the `dependencies`
// block of a package.json string to "^<version>". Leaves devDependencies
// and peerDependencies alone. Operates on the raw string to preserve
// formatting rather than round-tripping through JSON.parse.
export function updateWorkspaceDependencies(content: string, version: string): string {
  const depsBlock = /("dependencies"\s*:\s*\{)([\s\S]*?)(\n\s*\})/
  const match = content.match(depsBlock)
  if (!match) return content

  const [, open, body, close] = match
  const rewrittenBody = body.replace(
    /("@openpact\/[^"]+"\s*:\s*)"\*"/g,
    `$1"^${version}"`
  )
  if (rewrittenBody === body) return content
  return content.replace(depsBlock, `${open}${rewrittenBody}${close}`)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/update-workspace-deps.test.ts`
Expected: all four tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/lib/update-workspace-deps.ts scripts/release/test/update-workspace-deps.test.ts
git commit -m "feat(release): rewrite workspace '*' deps to caret ranges"
```

---

## Task 6: Pure function — `promoteChangelog`

**Files:**
- Create: `scripts/release/lib/promote-changelog.ts`
- Create: `scripts/release/test/promote-changelog.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/release/test/promote-changelog.test.ts`:

```typescript
import test from 'brittle'
import { promoteChangelog } from '../lib/promote-changelog'

test('promotes [Unreleased] to the given version and adds a fresh empty [Unreleased]', (t) => {
  const input = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- A thing.',
    '',
    '## [0.0.1] - 2026-04-01',
    '',
    '### Added',
    '',
    '- First thing.',
    '',
  ].join('\n')
  const expected = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [0.1.0] - 2026-04-18',
    '',
    '### Added',
    '',
    '- A thing.',
    '',
    '## [0.0.1] - 2026-04-01',
    '',
    '### Added',
    '',
    '- First thing.',
    '',
  ].join('\n')
  t.is(promoteChangelog(input, '0.1.0', '2026-04-18'), expected)
})

test('works when [Unreleased] is the only release section', (t) => {
  const input = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- A thing.',
    '',
  ].join('\n')
  const out = promoteChangelog(input, '0.1.0', '2026-04-18')
  t.ok(out.includes('## [Unreleased]\n\n## [0.1.0] - 2026-04-18\n'))
  t.ok(out.includes('- A thing.'))
})

test('throws when there is no [Unreleased] section', (t) => {
  t.exception(
    () => promoteChangelog('# Changelog\n\n## [0.0.1]\n', '0.1.0', '2026-04-18'),
    /no \[Unreleased\] section/
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/promote-changelog.test.ts`
Expected: fail, module missing.

- [ ] **Step 3: Implement**

`scripts/release/lib/promote-changelog.ts`:

```typescript
// Keep-a-Changelog promotion. Renames the top `## [Unreleased]`
// heading to `## [<version>] - <date>` and inserts a fresh empty
// `## [Unreleased]` section (heading + blank line) above it.
export function promoteChangelog(content: string, version: string, date: string): string {
  const headingRe = /^## \[Unreleased\]\s*$/m
  if (!headingRe.test(content)) {
    throw new Error('no [Unreleased] section found in CHANGELOG.md')
  }
  const newHeading = `## [${version}] - ${date}`
  const replacement = `## [Unreleased]\n\n${newHeading}`
  return content.replace(headingRe, replacement)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/promote-changelog.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/lib/promote-changelog.ts scripts/release/test/promote-changelog.test.ts
git commit -m "feat(release): promote [Unreleased] to a dated version section"
```

---

## Task 7: Pure function — `updateSiteVersion`

**Files:**
- Create: `scripts/release/lib/update-site-version.ts`
- Create: `scripts/release/test/update-site-version.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/release/test/update-site-version.test.ts`:

```typescript
import test from 'brittle'
import { updateSiteVersion } from '../lib/update-site-version'

test('rewrites the SITE_VERSION constant value', (t) => {
  const input = `export const SITE_VERSION = 'v0.1 alpha'\n`
  t.is(updateSiteVersion(input, '0.1.0'), `export const SITE_VERSION = 'v0.1.0'\n`)
})

test('preserves surrounding comments and whitespace', (t) => {
  const input = [
    '// Source of truth for the badge.',
    `export const SITE_VERSION = 'v0.1 alpha'`,
    '',
  ].join('\n')
  const expected = [
    '// Source of truth for the badge.',
    `export const SITE_VERSION = 'v0.1.0'`,
    '',
  ].join('\n')
  t.is(updateSiteVersion(input, '0.1.0'), expected)
})

test('throws when the SITE_VERSION constant is not found', (t) => {
  t.exception(
    () => updateSiteVersion('export const OTHER = 1\n', '0.1.0'),
    /SITE_VERSION/
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/update-site-version.test.ts`
Expected: fail, module missing.

- [ ] **Step 3: Implement**

`scripts/release/lib/update-site-version.ts`:

```typescript
// Rewrites the value of the `SITE_VERSION` constant to `v<version>`.
// The constant is declared in packages/site/src/version.ts as a single
// export const line. Throws if the constant is not found.
export function updateSiteVersion(content: string, version: string): string {
  const re = /(export const SITE_VERSION\s*=\s*')[^']*(')/
  if (!re.test(content)) {
    throw new Error('SITE_VERSION constant not found')
  }
  return content.replace(re, `$1v${version}$2`)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/update-site-version.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/lib/update-site-version.ts scripts/release/test/update-site-version.test.ts
git commit -m "feat(release): rewrite SITE_VERSION constant"
```

---

## Task 8: Release orchestrator — `scripts/release/index.ts`

**Files:**
- Create: `scripts/release/index.ts`

- [ ] **Step 1: Implement the orchestrator**

`scripts/release/index.ts`:

```typescript
#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { bumpPackageVersion } from './lib/bump-package'
import { promoteChangelog } from './lib/promote-changelog'
import { updateSiteVersion } from './lib/update-site-version'
import { updateWorkspaceDependencies } from './lib/update-workspace-deps'

const PUBLIC_PACKAGES = [
  'packages/daemon/package.json',
  'packages/sdk/package.json',
  'packages/mcp/package.json',
  'packages/skill/package.json',
  'packages/dashboard/package.json',
  'packages/openpact/package.json',
]

// @openpact/site is private but bumped so the site build can pick up
// the version. Never published.
const PRIVATE_BUMPED_PACKAGES = ['packages/site/package.json']

const ALL_PACKAGES = [...PUBLIC_PACKAGES, ...PRIVATE_BUMPED_PACKAGES]

const CHANGELOG = 'CHANGELOG.md'
const SITE_VERSION_FILE = 'packages/site/src/version.ts'

function main(): void {
  const [, , rawVersion] = process.argv
  if (!rawVersion) {
    fail('usage: npm run release -- <version>   (example: 0.1.0)')
  }
  const version = rawVersion.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
    fail(`"${rawVersion}" is not a semver version`)
  }

  preflight(version)

  const repoRoot = gitTopLevel()
  const today = new Date().toISOString().slice(0, 10)

  // Bump every package version.
  for (const rel of ALL_PACKAGES) {
    mutate(join(repoRoot, rel), (content) => bumpPackageVersion(content, version))
  }

  // Pin workspace deps in the publishable packages.
  for (const rel of PUBLIC_PACKAGES) {
    mutate(join(repoRoot, rel), (content) => updateWorkspaceDependencies(content, version))
  }

  // Update the site header badge.
  mutate(join(repoRoot, SITE_VERSION_FILE), (content) => updateSiteVersion(content, version))

  // Promote the changelog.
  mutate(join(repoRoot, CHANGELOG), (content) => promoteChangelog(content, version, today))

  // Stage and commit.
  git(['add', '--', CHANGELOG, SITE_VERSION_FILE, ...ALL_PACKAGES])
  git(['commit', '-m', `release: v${version}`])
  git(['tag', '-a', `v${version}`, '-m', `v${version}`])

  process.stdout.write(
    [
      `\nStaged, committed, and tagged v${version}.`,
      `Next step:   git push --follow-tags`,
      `The release workflow will pick it up on the tag push.`,
      '',
    ].join('\n')
  )
}

function preflight(version: string): void {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  if (branch !== 'main') fail(`release must run on main; currently on ${branch}`)

  const existingTag = git(['tag', '-l', `v${version}`]).trim()
  if (existingTag) fail(`tag v${version} already exists`)
}

function mutate(abs: string, fn: (content: string) => string): void {
  const before = readFileSync(abs, 'utf8')
  const after = fn(before)
  if (after !== before) writeFileSync(abs, after)
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' })
}

function gitTopLevel(): string {
  return git(['rev-parse', '--show-toplevel']).trim()
}

function fail(msg: string): never {
  process.stderr.write(`release: ${msg}\n`)
  process.exit(1)
}

main()
```

- [ ] **Step 2: Register the `release` npm script**

Edit root `package.json` and add under `scripts`:

```json
"release": "tsx scripts/release/index.ts"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/release/index.ts package.json
git commit -m "feat(release): scripts/release/index.ts orchestrator + npm script"
```

---

## Task 9: Integration test for the orchestrator

Sets up a tmp git repo with a minimal mirror of the release-relevant files, runs the script, asserts the resulting commit and tag.

**Files:**
- Create: `scripts/release/test/integration.test.ts`

- [ ] **Step 1: Write the test**

`scripts/release/test/integration.test.ts`:

```typescript
import test from 'brittle'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

test('release script bumps all packages, promotes changelog, commits, tags', (t) => {
  const work = mkdtempSync(join(tmpdir(), 'openpact-release-'))

  // Mirror the release-relevant files with stub contents.
  const write = (rel: string, content: string) => {
    const abs = join(work, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }

  for (const pkg of [
    'packages/daemon',
    'packages/sdk',
    'packages/mcp',
    'packages/skill',
    'packages/dashboard',
    'packages/openpact',
    'packages/site',
  ]) {
    write(
      `${pkg}/package.json`,
      `{\n  "name": "stub/${pkg}",\n  "version": "0.0.1",\n  "dependencies": {\n    "@openpact/sdk": "*"\n  }\n}\n`
    )
  }
  write('packages/site/src/version.ts', `export const SITE_VERSION = 'v0.1 alpha'\n`)
  write(
    'CHANGELOG.md',
    [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '- A thing.',
      '',
    ].join('\n')
  )

  // Bring the real script + libs into the sandbox via a symlink of
  // scripts/release so the test runs the actual code.
  execFileSync('ln', ['-s', join(REPO_ROOT, 'scripts'), join(work, 'scripts')])
  execFileSync('ln', ['-s', join(REPO_ROOT, 'node_modules'), join(work, 'node_modules')])
  execFileSync('ln', ['-s', join(REPO_ROOT, 'tsconfig.json'), join(work, 'tsconfig.json')])

  const g = (args: string[]) => execFileSync('git', args, { cwd: work, encoding: 'utf8' })
  g(['init', '-q', '-b', 'main'])
  g(['config', 'user.email', 'test@example.com'])
  g(['config', 'user.name', 'Test'])
  g(['add', '.'])
  g(['commit', '-q', '-m', 'seed'])

  // Run the release script.
  execFileSync('node', ['--import', 'tsx', 'scripts/release/index.ts', '0.1.0'], {
    cwd: work,
    encoding: 'utf8',
  })

  // Assertions.
  const daemonPkg = JSON.parse(readFileSync(join(work, 'packages/daemon/package.json'), 'utf8'))
  t.is(daemonPkg.version, '0.1.0')
  t.is(daemonPkg.dependencies['@openpact/sdk'], '^0.1.0')

  const sitePkg = JSON.parse(readFileSync(join(work, 'packages/site/package.json'), 'utf8'))
  t.is(sitePkg.version, '0.1.0')

  const siteVersion = readFileSync(join(work, 'packages/site/src/version.ts'), 'utf8')
  t.ok(siteVersion.includes("'v0.1.0'"))

  const changelog = readFileSync(join(work, 'CHANGELOG.md'), 'utf8')
  t.ok(/## \[Unreleased\]\s*$/m.test(changelog))
  t.ok(/## \[0\.1\.0\] - \d{4}-\d{2}-\d{2}/.test(changelog))

  const log = g(['log', '--pretty=%s', '-1']).trim()
  t.is(log, 'release: v0.1.0')

  const tags = g(['tag', '-l']).trim().split('\n')
  t.ok(tags.includes('v0.1.0'))
})
```

- [ ] **Step 2: Run it**

Run: `NODE_OPTIONS='--import tsx' npx brittle scripts/release/test/integration.test.ts`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/release/test/integration.test.ts
git commit -m "test(release): integration test for the orchestrator"
```

---

## Task 10: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  id-token: write

jobs:
  publish:
    name: publish to npm
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: npm
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      - name: Build
        run: npm run build

      - name: Validate
        run: npm run validate

      - name: Test
        run: npm test

      - name: Publish @openpact/sdk
        run: npm publish -w @openpact/sdk --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @openpact/daemon
        run: npm publish -w @openpact/daemon --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @openpact/skill
        run: npm publish -w @openpact/skill --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @openpact/mcp
        run: npm publish -w @openpact/mcp --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @openpact/dashboard
        run: npm publish -w @openpact/dashboard --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish openpact
        run: npm publish -w openpact --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Extract changelog section for this tag
        id: notes
        run: |
          version="${GITHUB_REF_NAME#v}"
          node -e '
            const fs = require("fs");
            const v = process.argv[1];
            const text = fs.readFileSync("CHANGELOG.md", "utf8");
            const re = new RegExp("## \\\\[" + v.replace(/\\./g, "\\\\.") + "\\\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\\\[|$)");
            const m = text.match(re);
            if (!m) { console.error("no section for " + v); process.exit(1); }
            fs.writeFileSync("RELEASE_NOTES.md", m[1].trim() + "\n");
          ' "$version"

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh release create "$GITHUB_REF_NAME" --title "$GITHUB_REF_NAME" --notes-file RELEASE_NOTES.md
```

Publish order is topological: `sdk` and `daemon` first (no workspace deps), `skill` next (depends on neither), then `mcp` and `dashboard` (depend on sdk + daemon), then `openpact` (placeholder, no deps but last so its publish does not block the meaningful ones).

- [ ] **Step 2: Validate YAML parses**

Run: `node -e 'require("fs").readFileSync(".github/workflows/release.yml", "utf8")'`
Expected: no output, no error.

If `actionlint` is available locally (`which actionlint`), run it too:
`actionlint .github/workflows/release.yml`
Expected: no findings.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow publishes on v* tags with provenance"
```

---

## Task 11: The skill — `.claude/skills/openpact-release/SKILL.md`

**Files:**
- Create: `.claude/skills/openpact-release/SKILL.md`

- [ ] **Step 1: Write the skill**

`.claude/skills/openpact-release/SKILL.md`:

```markdown
---
name: openpact-release
description: Cut a new OpenPact release. Walks through pre-flight checks, curates the changelog and site release entry, runs the bump + tag script, pushes, and verifies the GitHub Actions release workflow published all six public packages to npm. Use when the user runs /openpact-release, asks to cut a release, or asks to publish OpenPact to npm. Argument is the semver version (e.g. 0.1.0).
---

# openpact-release

Cut a versioned release of OpenPact. Ship all six public packages to npmjs.org in lockstep, tag the commit, post a GitHub Release.

## Usage

`/openpact-release <version>` — example: `/openpact-release 0.1.0`

## What this skill does

1. Pre-flight checks.
2. Curates the `CHANGELOG.md` [Unreleased] section and prepends a matching entry to `packages/site/src/docs/pages/Releases.tsx` with the operator's confirmation.
3. Runs `npm run release -- <version>` which bumps package versions, promotes the changelog, updates the site header badge, and creates a local commit + tag.
4. Shows the operator the diff and the tag. Waits for explicit "push" confirmation.
5. Pushes with `--follow-tags`. Watches the release workflow. Surfaces any failure.
6. Verifies each package is live on npm. Announces on the OpenPact dev pact.

## Step-by-step

### 1. Parse the argument

If no version given, ask. Validate it matches `N.N.N` (optionally with a `-prerelease` suffix). Strip a leading `v` if provided.

### 2. Pre-flight

Run all of these. If any fail, report which and stop.

- `git status --porcelain` returns empty (clean tree).
- `git rev-parse --abbrev-ref HEAD` returns `main`.
- `git fetch origin main` then `git rev-list HEAD...origin/main --count` returns `0` (in sync).
- `gh auth status` exits 0.
- `gh secret list` includes `NPM_TOKEN`.
- Latest CI run on `main` has `conclusion == success`: `gh run list --branch main --limit 1 --json conclusion,status`.
- `git tag -l v<version>` is empty.
- Files exist: `scripts/release/index.ts`, `.github/workflows/release.yml`, `CHANGELOG.md`, `packages/site/src/version.ts`.

### 3. Draft the changelog

Read the current `CHANGELOG.md` [Unreleased] section. If it already looks complete (non-trivial bullets under Added/Changed/Fixed as appropriate), skip to step 4.

If it needs curation:

- Run `git log v<prev>..HEAD --pretty="%h %s"` (or full log if no prior tag) and group commits into Added / Changed / Fixed / Removed using commit prefixes as hints.
- Present the draft to the operator. Wait for edits.
- Write the approved version into `CHANGELOG.md` under `## [Unreleased]`.

### 4. Prepend a releases page entry

Edit `packages/site/src/docs/pages/Releases.tsx`. Prepend a new object to the `RELEASES` array. Shape (TypeScript):

```typescript
{
  version: 'v<version>',
  date: '<YYYY-MM-DD>',
  tag: '<short descriptor, e.g. "Stable">',
  summary: '<one-sentence summary>',
  changes: {
    added: [ /* mirror the CHANGELOG Added bullets */ ],
    changed: [ /* Changed */ ],
    fixed: [ /* Fixed */ ],
    known: [ /* optional known-limits list */ ],
  },
},
```

Show the edit to the operator. Wait for edits. Apply.

### 5. Run the release script

`npm run release -- <version>`

The script bumps all package versions, promotes the changelog, updates `SITE_VERSION`, commits `release: v<version>`, and tags `v<version>`. It does not push.

### 6. Show and confirm

Run `git show v<version>` and summarise what is about to ship. Ask the operator explicitly: "Ready to push? This triggers the release workflow and starts the npm publish."

### 7. Push

`git push --follow-tags`

### 8. Watch the release workflow

`gh run watch` on the most recent `Release` workflow run. If it fails, surface the failing step. Recovery guidance:

- Failure before any publish: delete the tag locally and on origin, fix, retry.
  `git tag -d v<version>`
  `git push origin :refs/tags/v<version>`
- Failure after some packages published: do not unpublish. Bump to the next patch and re-release. Note the skipped version in the next CHANGELOG.md entry.

### 9. Verify

For each of `@openpact/daemon`, `@openpact/sdk`, `@openpact/mcp`, `@openpact/skill`, `@openpact/dashboard`, `openpact`:

`npm view <name>@<version> version`

All six must return `<version>`.

### 10. Announce

- Surface the GitHub Release URL: `gh release view v<version> --json url`.
- Post a knowledge entry to the OpenPact dev pact:

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" \
  -H "content-type: application/json" \
  -d '{"topic":"release","content":"v<version> shipped. npm, GitHub, site all live. <release notes URL>"}'
```

## Invariants

- Never publish from a dirty tree or off `main`.
- Never publish when the latest `main` CI run is not green.
- Local tag is created before push. Nothing hits remote until the operator confirms.
- If the workflow fails mid-publish, do not try to "fix" it by publishing manually from a laptop. Bump patch and retry through the same flow.
- `@openpact/cli` and `@openpact/site` stay `private: true`.

## First-release prerequisites (one-time)

If this is the first release ever:

- npm organization `openpact` exists. Created by the operator at `npmjs.com/org/create`. Free tier. Public packages.
- Granular npm automation token minted with publish rights on `@openpact/*` and `openpact`. Added to the repo as secret `NPM_TOKEN`. (Operator has confirmed this.)
- This skill's pre-flight catches missing prerequisites and stops.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/openpact-release/SKILL.md
git commit -m "skill: openpact-release checklist"
```

---

## Task 12: End-to-end dry run

Validates everything works before you actually cut v0.1.0.

- [ ] **Step 1: Create a throwaway branch**

```bash
git checkout -b release-dry-run
```

- [ ] **Step 2: Run the script against a bogus version**

```bash
npm run release -- 0.0.2
```

Expected: all the mutations complete, a `release: v0.0.2` commit lands on `release-dry-run`, a tag `v0.0.2` exists locally.

- [ ] **Step 3: Inspect the diff**

```bash
git show v0.0.2
```

Expected contents:
- Every public + private-but-bumped package.json has `"version": "0.0.2"`.
- `@openpact/mcp` and `@openpact/dashboard` have `"@openpact/sdk": "^0.0.2"` and `"@openpact/daemon": "^0.0.2"` under `dependencies`.
- `packages/site/src/version.ts` has `SITE_VERSION = 'v0.0.2'`.
- `CHANGELOG.md` has a fresh empty `## [Unreleased]` at the top and the previous `[Unreleased]` content under `## [0.0.2] - <today>`.

- [ ] **Step 4: Throw it away**

```bash
git tag -d v0.0.2
git checkout main
git branch -D release-dry-run
```

- [ ] **Step 5: Run the full test suite one more time**

```bash
npm test
```

Expected: all tests pass including the new ones under `scripts/release/test/`.

- [ ] **Step 6: No commit**

Nothing to commit. The dry run is throwaway. Actual v0.1.0 release happens later, through `/openpact-release 0.1.0`.

---

## Self-review notes

- **Spec coverage:** Every deliverable in the spec maps to a task. `.github/workflows/release.yml` → Task 10. `scripts/release.mjs` → Tasks 4-9 (split into pure units + orchestrator). `CHANGELOG.md` seed → Task 1. Site header bump → Tasks 2 + 7. Releases page entry → handled by the skill (Task 11, step 4) because it is narrative content, not mechanical. Skill file → Task 11. First-release prerequisites → documented in Task 11. Changelog curation → documented in Task 11, step 3.
- **Placeholder scan:** One intentional placeholder in Task 1: the engineer fills in the v0.1.0 bullets from `docs/OPENPACT_BUILD_PLAN.md` and `packages/site/src/docs/pages/Releases.tsx`. Noted explicitly in the task rather than left vague.
- **Type consistency:** Function names used across the plan — `bumpPackageVersion`, `updateWorkspaceDependencies`, `promoteChangelog`, `updateSiteVersion` — are defined once and referenced unchanged.
- **Ordering:** Task 2 must land before Task 8 because the orchestrator writes to `packages/site/src/version.ts`. Task 1 must land before Task 8 because the orchestrator mutates `CHANGELOG.md`. Task 3 must land before Tasks 4-7 so the new brittle glob picks up the tests. The order above honours these constraints.
