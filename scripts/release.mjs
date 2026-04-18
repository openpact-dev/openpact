#!/usr/bin/env node
/**
 * Release orchestrator. Mechanical only: the skill does the curation.
 *
 *   node scripts/release.mjs <version>
 *
 * Bumps every publishable package.json + the private site package.json,
 * rewrites workspace `*` deps to `^<version>` in the public packages,
 * updates the site version constant, promotes CHANGELOG.md's
 * [Unreleased] section to [<version>] - <today>, then commits.
 *
 * The script does NOT tag and does NOT push. The skill runs this on a
 * release/v<version> branch, opens a PR, and (only after the PR merges
 * into main and CI is green there) tags the merge commit on main and
 * pushes the tag to trigger the release workflow.
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
  'packages/cli/package.json',
]

// Private but bumped so the site build can read the release version.
const PRIVATE_BUMPED_PACKAGES = ['packages/site/package.json']

const ALL_BUMPED_PACKAGES = [...PUBLIC_PACKAGES, ...PRIVATE_BUMPED_PACKAGES]

const CHANGELOG = 'CHANGELOG.md'
const SITE_VERSION_FILE = 'packages/site/src/version.ts'

// Not mutated by this script, but the /openpact-release skill edits it
// (step 4: prepend the release entry) before invoking the script. Stage
// it so those edits land in the same release commit instead of leaving
// the working tree dirty after commit.
const RELEASES_PAGE = 'packages/site/src/docs/pages/Releases.tsx'

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

  git(['add', '--', CHANGELOG, SITE_VERSION_FILE, RELEASES_PAGE, ...ALL_BUMPED_PACKAGES])
  git(['commit', '-m', `release: v${version}`])

  const branch = currentBranch()
  process.stdout.write(
    [
      ``,
      `Staged and committed release: v${version} on ${branch}.`,
      `No tag created and nothing pushed.`,
      `Next steps (handled by the /openpact-release skill):`,
      `  1. git push -u origin ${branch}`,
      `  2. gh pr create --base main --title "release: v${version}"`,
      `  3. After the PR merges and main's CI is green:`,
      `       git checkout main && git pull --ff-only`,
      `       git tag -a v${version} -m "v${version}" && git push origin v${version}`,
      `     The tag push triggers .github/workflows/release.yml.`,
      ``,
    ].join('\n')
  )
}

function preflight(version) {
  const branch = currentBranch()
  if (branch === 'main') {
    fail(
      `release must run on a release/v<version> branch, not main. ` +
        `Create one with: git checkout -b release/v${version}`
    )
  }
  if (!branch.startsWith('release/')) {
    fail(`current branch "${branch}" does not look like release/v<version>`)
  }
  const localTag = git(['tag', '-l', `v${version}`]).trim()
  if (localTag) fail(`tag v${version} already exists locally`)
  const remoteTag = git(['ls-remote', '--tags', 'origin', `refs/tags/v${version}`]).trim()
  if (remoteTag) fail(`tag v${version} already exists on origin`)
}

function currentBranch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
}

// Pure: rewrites the top-level "version" field of a package.json string.
function bumpPackageVersion(content, newVersion) {
  const re = /^(\s+"version":\s*")[^"]+(".*)$/m
  if (!re.test(content)) throw new Error('no top-level version field in package.json')
  return content.replace(re, `$1${newVersion}$2`)
}

// Pure: rewrites "@openpact/*": "*" anywhere in the file to "^<version>".
// In this repo "*" is only ever used for workspace deps, so a global replace
// is safe and catches deps, devDeps, and (should they appear) peerDeps alike.
function updateWorkspaceDependencies(content, version) {
  return content.replace(/("@openpact\/[^"]+"\s*:\s*)"\*"/g, `$1"^${version}"`)
}

// Pure: promotes [Unreleased] to [X.Y.Z] - <date>, inserts a fresh [Unreleased] above.
// Allowing only [ \t] at the end of the heading line avoids greedily consuming
// the following newline in multiline mode, which would flatten the blank line
// between the version heading and the first section.
function promoteChangelog(content, version, date) {
  const re = /^## \[Unreleased\][ \t]*$/m
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
