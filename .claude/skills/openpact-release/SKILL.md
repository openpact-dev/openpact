---
name: openpact-release
description: Cut a new OpenPact release. Creates a release/v<version> branch, curates CHANGELOG.md and the site's Releases page entry, runs the bump script, opens a PR, waits for CI, merges, then tags the merge commit on main so the release workflow publishes all seven public packages to npm. Use when the user runs /openpact-release, asks to cut a release, or asks to publish OpenPact to npm. Argument is the semver version (e.g. 0.1.0).
---

# openpact-release

Cut a versioned release of OpenPact. Ship all seven public packages to npmjs.org in lockstep via a PR merge into main, then a tag push that triggers the release workflow.

## Usage

`/openpact-release <version>`   example: `/openpact-release 0.1.0`

If the user omits the version, ask for it before proceeding. Strip a leading `v` if they include one. Validate it matches `N.N.N` (optionally with a `-prerelease` suffix).

## Packages in scope

Published: `@openpact/daemon`, `@openpact/sdk`, `@openpact/mcp`, `@openpact/skill`, `@openpact/dashboard`, `@openpact/cli`, `openpact`.
Bumped but not published: `@openpact/site`.

## The flow in one picture

```
main (clean, CI green)
  └─ branch: release/v<version>
       ├─ curate CHANGELOG [Unreleased] + prepend Releases.tsx entry
       ├─ npm run release -- <version>   (bumps + promotes + commits, no tag)
       ├─ push branch + open PR
       ├─ CI runs on the PR → green
       ├─ merge PR (squash)
  main (release commit landed)
       ├─ tag the merge commit as v<version>, push the tag
       └─ tag push triggers .github/workflows/release.yml → npm publish + GitHub Release
```

## Step-by-step

### 1. Pre-flight

Run all of these. If any fail, report exactly which and stop.

```bash
VERSION=<the-version-without-v>

# clean tree, on main, in sync with origin
test -z "$(git status --porcelain)" || { echo "working tree not clean"; exit 1; }
test "$(git rev-parse --abbrev-ref HEAD)" = main || { echo "not on main"; exit 1; }
git fetch origin main --quiet
test "$(git rev-list HEAD...origin/main --count)" = 0 || { echo "not in sync with origin/main"; exit 1; }

# gh is authenticated
gh auth status

# NPM_TOKEN secret is configured
gh secret list | grep -q '^NPM_TOKEN' || { echo "NPM_TOKEN secret missing"; exit 1; }

# latest main CI run is green
gh run list --branch main --limit 1 --json conclusion,status \
  | grep -q '"conclusion":"success"' || { echo "latest main CI is not green"; exit 1; }

# the version tag does not already exist
test -z "$(git tag -l v$VERSION)" || { echo "tag v$VERSION already exists locally"; exit 1; }
test -z "$(git ls-remote --tags origin refs/tags/v$VERSION)" || { echo "tag v$VERSION already on origin"; exit 1; }

# required files are in place
test -f scripts/release.mjs
test -f .github/workflows/release.yml
test -f CHANGELOG.md
test -f packages/site/src/version.ts
```

### 2. Create the release branch

```bash
git checkout -b release/v<version>
```

All subsequent edits happen on this branch, not on main.

### 3. Curate the changelog

Read `CHANGELOG.md`. Look at the `## [Unreleased]` section.

If it is already populated with bullets under Added / Changed / Fixed that reflect what is shipping, skip to step 4.

Otherwise:

- Find the previous tag with `git describe --tags --abbrev=0` (falls back to full history if there is no previous tag).
- Show the operator `git log v<prev>..HEAD --pretty="%h %s"`.
- Group the commits into Added / Changed / Fixed / Removed using commit-message prefixes as hints, not as authority.
- Present the draft to the operator. Wait for edits.
- Write the approved content into the `## [Unreleased]` section of `CHANGELOG.md`.

Keep entries short, no em-dashes, no marketing voice. Follow the style rules in `CLAUDE.md`.

### 4. Prepend the site releases-page entry

Edit `packages/site/src/docs/pages/Releases.tsx`. Prepend a new object to the `RELEASES` array. Template:

```typescript
{
  version: 'v<version>',
  date: '<YYYY-MM-DD>',
  tag: '<short descriptor, e.g. "Stable" or "Beta">',
  summary: '<one-sentence summary of the release>',
  changes: {
    added: [ /* mirror the CHANGELOG Added bullets */ ],
    changed: [ /* Changed */ ],
    fixed: [ /* Fixed */ ],
    known: [ /* optional known-limits list */ ],
  },
},
```

Show the edit to the operator. Wait for confirmation. Apply.

### 5. Run the release script

```bash
npm run release -- <version>
```

The script:

- Checks you are on a `release/v*` branch (not main) and the tag is not already taken.
- Bumps every publishable `package.json` and the private `@openpact/site` `package.json` to the new version.
- Rewrites `"@openpact/*": "*"` workspace deps to `"^<version>"` so published tarballs resolve on consumer machines.
- Rewrites `SITE_VERSION` in `packages/site/src/version.ts` to `v<version>`.
- Promotes `## [Unreleased]` in `CHANGELOG.md` to `## [<version>] - <today>`, inserts a fresh empty `[Unreleased]` above.
- `git add` + `git commit -m "release: v<version>"`.
- Does **not** tag and does **not** push.

### 6. Push the branch and open the PR

```bash
git push -u origin release/v<version>
```

```bash
gh pr create \
  --base main \
  --head release/v<version> \
  --title "release: v<version>" \
  --body "Cuts v<version>. Ship flow:
1. Verify CI green on this PR.
2. Squash-merge to main.
3. Tag the resulting main commit as v<version> and push the tag.
4. The tag push triggers .github/workflows/release.yml which publishes to npm."
```

### 7. Wait for CI on the PR

```bash
gh pr checks --watch
```

If any required check fails, fix on the branch, push again, loop.

### 8. Show and confirm

Show the operator the PR URL (`gh pr view --json url -q .url`) and summarise:

"PR #<n> is green and ready. Squash-merging this will:
- Land the version bumps on main.
- Trigger a tag push that publishes six packages to npm under the `openpact` org.

Ready to merge and ship?"

Wait for an explicit yes.

### 9. Merge the PR

```bash
gh pr merge release/v<version> --squash --delete-branch
```

`--squash` keeps main's history linear and produces a single `release: v<version>` commit on main.

### 10. Sync main and tag the merge commit

```bash
git checkout main
git pull --ff-only
git tag -a v<version> -m "v<version>"
git push origin v<version>
```

The tag push triggers `.github/workflows/release.yml`. Nothing has been published yet at this point; the workflow does the publishing.

### 11. Watch the release workflow

```bash
gh run watch
```

or

```bash
gh run list --workflow=release.yml --limit 1
gh run view <id> --web  # if the operator wants to open it
```

If the workflow fails:

- **Before any publish step succeeded:** delete the tag locally and on origin, fix the underlying issue (commit the fix via a normal PR into main), then re-tag from the new main HEAD.
  ```bash
  git tag -d v<version>
  git push origin :refs/tags/v<version>
  ```
- **After some packages published:** do not try to unpublish. Bump to the next patch and release again through the same flow. Note the skipped version in the next CHANGELOG.md entry.

### 12. Verify the seven packages are live

```bash
for pkg in "@openpact/daemon" "@openpact/sdk" "@openpact/mcp" "@openpact/skill" "@openpact/dashboard" "@openpact/cli" "openpact"; do
  echo -n "$pkg: "
  npm view "$pkg@<version>" version 2>&1 || echo "NOT PUBLISHED"
done
```

All seven lines must match `<version>`. If any is missing, surface it to the operator.

### 13. Surface the GitHub Release URL

```bash
gh release view v<version> --json url -q .url
```

### 14. Announce on the dev pact

```bash
OPENPACT_URL="http://127.0.0.1:7666"
OPENPACT_PACT="qr-testing"
OPENPACT_TOKEN="$(jq -r .apiToken "$HOME/.openpact/daemon.json")"

curl -sf -H "Authorization: Bearer $OPENPACT_TOKEN" \
  -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" \
  -H "content-type: application/json" \
  -d "{\"topic\":\"release\",\"content\":\"v<version> shipped. npm, GitHub, site all live. <release URL>\"}"
```

If the local daemon is not running, skip this step. Do not try to start it.

## Invariants

- The release script never runs on `main`. Always on a `release/v<version>` branch.
- Version bumps reach main only through a PR merge with CI green.
- The tag is created and pushed only after the PR has merged and main is synced locally. Tag is applied to main's HEAD, which by definition is the squashed release commit.
- If the release workflow fails mid-publish, do not publish manually from a laptop. Bump patch and retry through the same flow.
- `@openpact/site` stays `private: true`.

## First-release prerequisites (one-time)

If this is the first release ever:

- npm organization `openpact` exists. Created by the operator at `npmjs.com/org/create`. Free tier. Public packages.
- A granular npm automation token with publish rights on `@openpact/*` and `openpact`, added to the repo as secret `NPM_TOKEN`. (Operator has confirmed this.)
- This skill's pre-flight catches missing prerequisites and stops.
