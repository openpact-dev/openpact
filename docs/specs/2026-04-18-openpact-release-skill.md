# Design: `/openpact-release` skill

Date: 2026-04-18
Status: approved, ready for implementation plan

## Goal

A repeatable, low-surprise way to cut a tagged release and publish every public OpenPact package to npmjs.org. The skill is the operator-facing checklist. The real work happens in a GitHub Actions workflow triggered by a version tag.

## Scope

In:

- Releasing all six public packages (`@openpact/daemon`, `@openpact/sdk`, `@openpact/mcp`, `@openpact/skill`, `@openpact/dashboard`, `openpact`) in lockstep.
- A hand-curated root `CHANGELOG.md` in Keep-a-Changelog format.
- A GitHub Actions workflow that publishes on `v*` tags with npm provenance.
- A `scripts/release.mjs` helper that bumps versions, rewrites the changelog, commits, and tags locally.
- Keeping the visible version badge in the site header (`packages/site/src/components/Header.tsx`) in sync with the release. The release script updates it. The exact mechanism (shared constant, Vite `define`, or direct string edit) is resolved during implementation.
- Adding a new entry to the site's releases page (`packages/site/src/docs/pages/Releases.tsx`) for the version being shipped. The skill prompts the operator to confirm the summary text before committing.
- A skill that walks the operator through pre-flight, curation, bump, push, verify, and announce.

Out:

- `@openpact/cli` and `@openpact/site` stay `private: true` and never ship via this flow.
- No automatic changelog generation from commit messages.
- No independent per-package versioning. If we need that later, we migrate to changesets in a separate effort.
- No publishing to GitHub Packages. npmjs.org only.

## Registry and credentials

- Registry: `https://registry.npmjs.org`, public access.
- npm organization: `openpact` (must be created before the first release).
- Token: a granular npm automation token with publish rights on `@openpact/*` and `openpact`, stored as the GitHub Actions repo secret `NPM_TOKEN`. User confirmed the secret is already set.
- Each `npm publish` call uses `--access public --provenance`. Provenance is supported because the workflow runs on a public GitHub repo with an `id-token: write` permission.

## Artifacts to create

1. `.github/workflows/release.yml`
   - Triggers on pushed tags matching `v*`.
   - One job, Ubuntu, Node 22, `npm ci`, `npm run test:all`, then a publish step per package in topological order (resolved during implementation from actual workspace dependencies).
   - Each publish runs `npm publish -w <pkg> --access public --provenance` with `NODE_AUTH_TOKEN=${{ secrets.NPM_TOKEN }}` and a registry-setup step for `registry.npmjs.org`.
   - After all publishes succeed, a `gh release create` step extracts the matching `## [X.Y.Z]` section from `CHANGELOG.md` and posts it as the GitHub Release body.
   - Permissions: `contents: write` (for the release), `id-token: write` (for provenance).

2. `scripts/release.mjs`
   - Signature: `node scripts/release.mjs <version>` where `<version>` is a semver string.
   - Validates: working tree clean, current branch `main`, local `main` matches `origin/main`, no existing `v<version>` tag.
   - Edits every publishable `package.json` (the six listed above) to the new version. Leaves private packages alone, with one exception: `@openpact/site` also gets its version field bumped so the site build can pick up the release version. The `site` package stays `private: true` and is never published.
   - Updates the visible version in the site header to reflect the new release. The release script is the single place that knows how to do this. Implementation may introduce a shared constant or Vite-injected define so the edit is not a fragile string substitution.
   - Prepends a new entry to `packages/site/src/docs/pages/Releases.tsx` for the release being shipped. The entry mirrors the `CHANGELOG.md` section written in step (3).
   - Rewrites `CHANGELOG.md`: renames the top `## [Unreleased]` heading to `## [<version>] - <YYYY-MM-DD>` and inserts a fresh empty `## [Unreleased]` above it.
   - `git add` the touched files, commits `release: v<version>`, tags `v<version>`. Does not push.
   - Prints next step: `git push --follow-tags`.

3. `CHANGELOG.md` (repo root, Keep-a-Changelog)
   - Seeded with an empty `## [Unreleased]` section at the top and a populated `## [0.1.0] - <date>` section beneath it, summarising everything that has shipped up to this release. First-release content comes from reading `docs/OPENPACT_BUILD_PLAN.md` and git history.

4. `.claude/skills/openpact-release/SKILL.md`
   - The checklist the skill follows. Lives inside the repo so it travels with the release process.

## Command UX

Operator runs `/openpact-release <version>`. The skill:

1. Pre-flight checks (fail fast, report which check failed):
   - Clean working tree, on `main`, in sync with `origin/main`.
   - Last CI run on `main` is green (`gh run list --branch main --limit 1 --json conclusion`).
   - `gh auth status` succeeds.
   - Repo secret `NPM_TOKEN` exists (`gh secret list`).
   - One-time checks, only if this is the first release: npm org `openpact` exists (`npm org ls openpact` or best-effort via `npm view`), `scripts/release.mjs` and `.github/workflows/release.yml` are present.
   - The skill does not run `npm run test:all` locally. The release workflow runs it on the tag push before any package is published, and the pre-flight already requires green CI on `main`. Operator can run it manually if they want extra confidence.

2. Changelog curation:
   - Skill runs `git log v<prev>..HEAD` (or full history if no prior tag).
   - Groups commits into Added / Changed / Fixed / Removed using commit-message prefixes as hints, not as authority.
   - Presents the draft to the operator, waits for edits, then writes the result under `## [Unreleased]`.

3. Bump and tag:
   - Skill runs `node scripts/release.mjs <version>`.
   - Shows `git show v<version>` output (the release commit plus tag).

4. Confirm and push:
   - Skill asks the operator to confirm. On yes: `git push --follow-tags`.
   - Skill then runs `gh run watch` on the triggered release workflow and surfaces the result.

5. Verify and announce:
   - `npm view @openpact/<name>@<version>` for each of the six packages. All must match.
   - Surface the GitHub Release URL.
   - Post a knowledge entry to the OpenPact dev pact with topic `release` and a one-line summary.

## Prerequisites (first release only)

The skill's first run detects the absence of the infrastructure and walks the operator through:

- npm organization `openpact` created at `npmjs.com/org/create` (free tier, public packages).
- Granular npm automation token minted with publish rights on `@openpact/*` and `openpact`, 1-year expiry.
- GitHub secret `NPM_TOKEN` added at `github.com/openpact-dev/openpact/settings/secrets/actions`. Already done.
- `scripts/release.mjs` and `.github/workflows/release.yml` present on `main`.

After the first successful release, these checks become a ~2-second fast path.

## Invariants

- Never publish from a dirty tree or off `main`.
- Never publish when the latest `main` CI run is not green. The workflow re-runs `npm run test:all` on the tag and refuses to publish if it fails.
- Local tag is created before any push. Nothing reaches the remote until the operator explicitly confirms.
- `@openpact/cli` and `@openpact/site` are not touched by the release flow.
- Lockstep: every public package moves to the new version. If one can't build, the release fails and no package is published.

## Failure modes and recovery

- Pre-flight check fails: skill reports exactly which check and stops. Nothing is written.
- `scripts/release.mjs` fails mid-way (rare, would mean a disk or git error): operator runs `git restore -- .` and re-runs. The script is idempotent on a clean tree.
- Workflow fails before any publish succeeds: delete the tag locally and on origin (`git tag -d v<version>` and `git push origin :refs/tags/v<version>`), fix the issue, re-run the skill with the same version.
- Workflow fails after some packages have published: npm does not support unpublishing within 72 hours without intervention, and even then it is not the right tool. The recovery is to bump the patch version, publish again, and note the skipped version in the changelog. The skill surfaces this clearly rather than pretending rollback is possible.
- GitHub Release creation fails after publishes succeed: operator creates it manually from the tag in the GitHub UI. Low-priority fix.

## Alternatives considered

- Changesets for independent versioning. Rejected for v0.1.0 because the packages are tightly coupled. Revisit when the SDK stabilises ahead of the daemon or vice versa.
- `semantic-release` with Conventional Commits enforcement. Rejected because the existing commit history is mixed and enforcing strict conventions across six packages is more discipline than this repo needs right now.
- Publishing from a local machine. Rejected because it couples releases to one laptop's state and ships no provenance attestations.
- GitHub Packages as the npm registry. Rejected because it forces every consumer to configure a custom `.npmrc` and authenticate with a GitHub PAT, even for public reads. Fatal friction for a project whose point is low-friction agent adoption.

## Open questions

None. All design decisions above are settled with the user.
