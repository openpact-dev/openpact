#!/usr/bin/env node
/**
 * Release orchestrator. Mechanical only: the skill does the curation.
 *
 *   node scripts/release.mjs <version>
 *
 * Bumps every publishable package.json + the private site package.json,
 * rewrites workspace `*` deps to `^<version>` in the public packages,
 * updates the site version constant, promotes CHANGELOG.md's
 * [Unreleased] section to [<version>] - <today>, then commits and tags.
 * Does not push.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PUBLIC_PACKAGES = [
  'packages/daemon/package.json',
  'packages/sdk/package.json',
  'packages/mcp/package.json',
  'packages/skill/package.json',
  'packages/dashboard/package.json',
  'packages/openpact/package.json',
]

// Private but bumped so the site build can read the release version.
const PRIVATE_BUMPED_PACKAGES = ['packages/site/package.json']

const ALL_BUMPED_PACKAGES = [...PUBLIC_PACKAGES, ...PRIVATE_BUMPED_PACKAGES]

const CHANGELOG = 'CHANGELOG.md'
const SITE_VERSION_FILE = 'packages/site/src/version.ts'

main()

function main() {
  const raw = process.argv[2]
  if (!raw) fail('usage: npm run release -- <version>   (example: 0.1.0)')
  const version = raw.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
    fail(`"${raw}" is not a semver version`)
  }

  preflight(version)

  const repoRoot = gitTopLevel()
  const today = new Date().toISOString().slice(0, 10)

  for (const rel of ALL_BUMPED_PACKAGES) {
    mutate(join(repoRoot, rel), (c) => bumpPackageVersion(c, version))
  }

  for (const rel of PUBLIC_PACKAGES) {
    mutate(join(repoRoot, rel), (c) => updateWorkspaceDependencies(c, version))
  }

  mutate(join(repoRoot, SITE_VERSION_FILE), (c) => updateSiteVersion(c, version))

  mutate(join(repoRoot, CHANGELOG), (c) => promoteChangelog(c, version, today))

  git(['add', '--', CHANGELOG, SITE_VERSION_FILE, ...ALL_BUMPED_PACKAGES])
  git(['commit', '-m', `release: v${version}`])
  git(['tag', '-a', `v${version}`, '-m', `v${version}`])

  process.stdout.write(
    [
      ``,
      `Staged, committed, and tagged v${version}.`,
      `Next step:   git push --follow-tags`,
      `The release workflow publishes on the tag push.`,
      ``,
    ].join('\n')
  )
}

function preflight(version) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  if (branch !== 'main') fail(`release must run on main; currently on ${branch}`)
  const tag = git(['tag', '-l', `v${version}`]).trim()
  if (tag) fail(`tag v${version} already exists`)
}

// Pure: rewrites the top-level "version" field of a package.json string.
function bumpPackageVersion(content, newVersion) {
  const re = /^(\s+"version":\s*")[^"]+(".*)$/m
  if (!re.test(content)) throw new Error('no top-level version field in package.json')
  return content.replace(re, `$1${newVersion}$2`)
}

// Pure: rewrites "@openpact/*": "*" inside the dependencies block to "^<version>".
function updateWorkspaceDependencies(content, version) {
  const depsBlock = /("dependencies"\s*:\s*\{)([\s\S]*?)(\n\s*\})/
  const match = content.match(depsBlock)
  if (!match) return content
  const [, open, body, close] = match
  const rewritten = body.replace(/("@openpact\/[^"]+"\s*:\s*)"\*"/g, `$1"^${version}"`)
  if (rewritten === body) return content
  return content.replace(depsBlock, `${open}${rewritten}${close}`)
}

// Pure: promotes [Unreleased] to [X.Y.Z] - <date>, inserts a fresh [Unreleased] above.
function promoteChangelog(content, version, date) {
  const re = /^## \[Unreleased\]\s*$/m
  if (!re.test(content)) throw new Error('no [Unreleased] section found in CHANGELOG.md')
  return content.replace(re, `## [Unreleased]\n\n## [${version}] - ${date}`)
}

// Pure: rewrites the SITE_VERSION constant string to `v<version>`.
function updateSiteVersion(content, version) {
  const re = /(export const SITE_VERSION\s*=\s*')[^']*(')/
  if (!re.test(content)) throw new Error('SITE_VERSION constant not found')
  return content.replace(re, `$1v${version}$2`)
}

function mutate(abs, fn) {
  const before = readFileSync(abs, 'utf8')
  const after = fn(before)
  if (after !== before) writeFileSync(abs, after)
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

function gitTopLevel() {
  return git(['rev-parse', '--show-toplevel']).trim()
}

function fail(msg) {
  process.stderr.write(`release: ${msg}\n`)
  process.exit(1)
}
