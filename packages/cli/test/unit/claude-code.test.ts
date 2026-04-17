import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  OPENPACT_MARKER,
  buildOpenpactHooks,
  loadSettings,
  mergeSettings,
  serialiseSettings,
  settingsPath,
  writeSettings,
  type ClaudeSettings,
} from '../../src/lib/claude-code'

async function tmpDir(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-claude-code-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

test('buildOpenpactHooks: bakes alias into the command', (t) => {
  const groups = buildOpenpactHooks('my-pact')
  t.is(groups.SessionStart.hooks[0].command, 'openpact hook session-start --pact my-pact')
  t.is(groups.UserPromptSubmit.hooks[0].command, 'openpact hook prompt-submit --pact my-pact')
  t.is(groups.SessionStart[OPENPACT_MARKER], true)
  t.is(groups.UserPromptSubmit[OPENPACT_MARKER], true)
})

test('buildOpenpactHooks: custom bin command', (t) => {
  const groups = buildOpenpactHooks('p', '/usr/local/bin/openpact')
  t.is(groups.SessionStart.hooks[0].command, '/usr/local/bin/openpact hook session-start --pact p')
})

test('loadSettings: missing file → empty object', async (t) => {
  const dir = await tmpDir(t)
  const out = await loadSettings(path.join(dir, 'nope.json'))
  t.alike(out, {})
})

test('loadSettings: empty file → empty object', async (t) => {
  const dir = await tmpDir(t)
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(file, '', 'utf8')
  t.alike(await loadSettings(file), {})
})

test('loadSettings: malformed JSON → throws with path', async (t) => {
  const dir = await tmpDir(t)
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(file, '{not json', 'utf8')
  await t.exception(() => loadSettings(file), /is not valid JSON/)
})

test('loadSettings: array top-level → throws', async (t) => {
  const dir = await tmpDir(t)
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(file, '[1,2,3]', 'utf8')
  await t.exception(() => loadSettings(file), /must contain a JSON object/)
})

test('mergeSettings: empty file adds both hooks', (t) => {
  const { settings, changes, skippedExisting } = mergeSettings({}, { alias: 'default' })
  t.absent(skippedExisting)
  t.is(changes.length, 2)
  t.ok(settings.hooks?.SessionStart?.length === 1)
  t.ok(settings.hooks?.UserPromptSubmit?.length === 1)
  t.is(settings.hooks!.SessionStart![0][OPENPACT_MARKER], true)
})

test('mergeSettings: preserves unrelated keys', (t) => {
  const existing: ClaudeSettings = {
    permissions: { allow: ['Bash'] },
    env: { FOO: 'bar' },
    hooks: {
      PostToolUse: [
        { matcher: 'Edit', hooks: [{ type: 'command', command: '/usr/local/bin/lint.sh' }] },
      ],
    },
  }
  const { settings } = mergeSettings(existing, { alias: 'x' })
  t.alike(settings.permissions, { allow: ['Bash'] })
  t.alike(settings.env, { FOO: 'bar' })
  // The user's own PostToolUse hook is still there.
  t.is(settings.hooks!.PostToolUse![0].hooks[0].command, '/usr/local/bin/lint.sh')
  // And our new hooks landed alongside.
  t.ok(settings.hooks!.SessionStart!.length >= 1)
  t.ok(settings.hooks!.UserPromptSubmit!.length >= 1)
})

test('mergeSettings: idempotent re-run is a no-op', (t) => {
  const first = mergeSettings({}, { alias: 'default' })
  const second = mergeSettings(first.settings, { alias: 'default' })
  t.is(second.changes.length, 0, 'no changes on second run')
  t.alike(second.settings, first.settings)
})

test('mergeSettings: different alias without --force is skipped', (t) => {
  const first = mergeSettings({}, { alias: 'alpha' })
  const second = mergeSettings(first.settings, { alias: 'beta' })
  t.ok(second.skippedExisting)
  t.is(
    second.settings.hooks!.SessionStart![0].hooks[0].command,
    'openpact hook session-start --pact alpha',
    'existing hook untouched without --force',
  )
  t.ok(second.changes.some((c) => c.includes('--force')))
})

test('mergeSettings: different alias with --force overwrites', (t) => {
  const first = mergeSettings({}, { alias: 'alpha' })
  const second = mergeSettings(first.settings, { alias: 'beta', force: true })
  t.absent(second.skippedExisting)
  t.is(
    second.settings.hooks!.SessionStart![0].hooks[0].command,
    'openpact hook session-start --pact beta',
  )
  t.is(second.changes.length, 2)
})

test('mergeSettings: coexists alongside user hooks on the same event', (t) => {
  const existing: ClaudeSettings = {
    hooks: {
      SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: '/my/own.sh' }] }],
    },
  }
  const { settings } = mergeSettings(existing, { alias: 'default' })
  const groups = settings.hooks!.SessionStart!
  t.is(groups.length, 2, 'user hook and ours both present')
  t.ok(groups.some((g) => g.hooks[0].command === '/my/own.sh'))
  t.ok(groups.some((g) => g.hooks[0].command === 'openpact hook session-start --pact default'))
})

test('serialiseSettings: 2-space indent with trailing newline', (t) => {
  const out = serialiseSettings({ hooks: { SessionStart: [] } })
  t.is(out, '{\n  "hooks": {\n    "SessionStart": []\n  }\n}\n')
})

test('writeSettings: creates .claude/ if missing and writes atomically', async (t) => {
  const dir = await tmpDir(t)
  const file = settingsPath(dir)
  await writeSettings(file, { hooks: {} })
  const raw = await fs.readFile(file, 'utf8')
  t.is(raw, '{\n  "hooks": {}\n}\n')
})

test('writeSettings: overwrites existing file atomically', async (t) => {
  const dir = await tmpDir(t)
  const file = settingsPath(dir)
  await writeSettings(file, { hooks: {} })
  await writeSettings(file, { hooks: { SessionStart: [] } })
  const raw = await fs.readFile(file, 'utf8')
  t.ok(raw.includes('SessionStart'))
})

test('settingsPath: joins .claude/settings.json', (t) => {
  t.is(settingsPath('/tmp/x'), path.join('/tmp/x', '.claude', 'settings.json'))
})
