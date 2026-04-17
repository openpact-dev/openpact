import test from 'brittle'
import fs from 'fs/promises'
import path from 'path'
import net from 'net'
import { tmpHome, runWithDir, authHeaders } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

async function ensureKilled(pid: number | null): Promise<void> {
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const addr = srv.address()
      if (!addr || typeof addr === 'string') return reject(new Error('bad address'))
      srv.close(() => resolve(addr.port))
    })
  })
}

async function waitForPing(base: string, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/v1/ping`)
      if (res.ok) return
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`daemon at ${base} did not become reachable within ${timeout}ms`)
}

test('install claude-code: writes SessionStart + UserPromptSubmit hooks', async (t) => {
  const home = await tmpHome(t)
  const project = await tmpHome(t)
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })

  const res = await runWithDir(home, ['install', 'claude-code', '--dir', project], {
    reject: true,
  })
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Sealed'))
  t.ok(res.stdout.includes('default'))

  const settingsRaw = await fs.readFile(path.join(project, '.claude', 'settings.json'), 'utf8')
  const settings = JSON.parse(settingsRaw)
  t.ok(settings.hooks.SessionStart, 'SessionStart present')
  t.ok(settings.hooks.UserPromptSubmit, 'UserPromptSubmit present')
  t.is(
    settings.hooks.SessionStart[0].hooks[0].command,
    'openpact hook session-start --pact default',
  )
  t.is(
    settings.hooks.UserPromptSubmit[0].hooks[0].command,
    'openpact hook prompt-submit --pact default',
  )
  t.is(settings.hooks.SessionStart[0]['openpact-managed:v1'], true)
})

test('install claude-code: idempotent re-run, preserves unrelated keys', async (t) => {
  const home = await tmpHome(t)
  const project = await tmpHome(t)
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })

  // Pre-seed with a user-authored unrelated block + a different hook event.
  await fs.mkdir(path.join(project, '.claude'), { recursive: true })
  await fs.writeFile(
    path.join(project, '.claude', 'settings.json'),
    JSON.stringify(
      {
        permissions: { allow: ['Bash'] },
        hooks: {
          PostToolUse: [
            {
              matcher: 'Edit',
              hooks: [{ type: 'command', command: '/usr/local/bin/lint.sh' }],
            },
          ],
        },
      },
      null,
      2,
    ),
    'utf8',
  )

  await runWithDir(home, ['install', 'claude-code', '--dir', project], { reject: true })
  const second = await runWithDir(home, ['install', 'claude-code', '--dir', project], {
    reject: true,
  })
  t.is(second.exitCode, 0)
  t.ok(second.stdout.includes('already up to date'))

  const settingsRaw = await fs.readFile(path.join(project, '.claude', 'settings.json'), 'utf8')
  const settings = JSON.parse(settingsRaw)
  // User's unrelated permissions and PostToolUse hook survive.
  t.alike(settings.permissions, { allow: ['Bash'] })
  t.is(settings.hooks.PostToolUse[0].hooks[0].command, '/usr/local/bin/lint.sh')
  // Our hooks landed.
  t.ok(settings.hooks.SessionStart)
  t.ok(settings.hooks.UserPromptSubmit)
})

test('install claude-code: different pact without --force is refused', async (t) => {
  const home = await tmpHome(t)
  const project = await tmpHome(t)
  await runWithDir(home, ['init', '--alias', 'alpha', '--no-interactive'], { reject: true })
  await runWithDir(home, ['init', '--alias', 'beta', '--no-interactive'], { reject: true })

  // First install bakes in alpha.
  await runWithDir(home, ['install', 'claude-code', '--dir', project, '--pact', 'alpha'], {
    reject: true,
  })

  // Second install with beta (no --force) must refuse.
  const res = await runWithDir(
    home,
    ['install', 'claude-code', '--dir', project, '--pact', 'beta'],
    {},
  )
  t.is(res.exitCode, 1)
  t.ok(res.stderr.includes('--force'))

  // File still bakes alpha (not overwritten).
  const settings = JSON.parse(
    await fs.readFile(path.join(project, '.claude', 'settings.json'), 'utf8'),
  )
  t.is(settings.hooks.SessionStart[0].hooks[0].command, 'openpact hook session-start --pact alpha')

  // With --force, swap to beta.
  const forced = await runWithDir(
    home,
    ['install', 'claude-code', '--dir', project, '--pact', 'beta', '--force'],
    { reject: true },
  )
  t.is(forced.exitCode, 0)
  const after = JSON.parse(
    await fs.readFile(path.join(project, '.claude', 'settings.json'), 'utf8'),
  )
  t.is(after.hooks.SessionStart[0].hooks[0].command, 'openpact hook session-start --pact beta')
})

test('hook session-start: emits pact context as JSON', async (t) => {
  const home = await tmpHome(t)
  const port = await getFreePort()
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })
  await runWithDir(home, ['start', '--no-dashboard', '--port', String(port)], { reject: true })
  const pid = await readPidFile(home)
  t.teardown(() => ensureKilled(pid))
  t.teardown(() => runWithDir(home, ['stop']).catch(() => {}))

  const base = `http://127.0.0.1:${port}`
  await waitForPing(base)

  // Seed the pact with a task + a message so session-start has something to show.
  const headers = await authHeaders(home, { 'content-type': 'application/json' })
  await fetch(`${base}/v1/pacts/default/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Refactor auth middleware' }),
  })
  await fetch(`${base}/v1/pacts/default/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: 'pact warmup message' }),
  })
  // Allow apply to land.
  await new Promise((r) => setTimeout(r, 400))

  // session-start fed an empty stdin (no cwd JSON) — that's fine; it
  // will fall back to process.cwd().
  const res = await runWithDir(home, ['hook', 'session-start', '--port', String(port)], {
    input: '',
  })
  t.is(res.exitCode, 0)
  const parsed = JSON.parse(res.stdout.trim())
  t.is(parsed.hookSpecificOutput.hookEventName, 'SessionStart')
  const ctx: string = parsed.hookSpecificOutput.additionalContext
  t.ok(ctx.includes('Refactor auth middleware'), 'open task surfaced')
  // The message from the bootstrap agent is self-authored (we posted
  // it ourselves via REST) — session-start filters self, so it may or
  // may not appear depending on whether the REST call's agent_id
  // matches the daemon's peer_handle. Just assert the header made it.
  t.ok(ctx.includes('OpenPact shared memory'))
  t.ok(ctx.includes('Your handle'))

  // Cursor file should exist after session-start runs.
  const hookDir = path.join(home, 'hooks')
  const files = await fs.readdir(hookDir)
  t.ok(files.length === 1, 'one cursor file written')
})

test('hook prompt-submit: silent first run then silent with nothing new', async (t) => {
  const home = await tmpHome(t)
  const port = await getFreePort()
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })
  await runWithDir(home, ['start', '--no-dashboard', '--port', String(port)], { reject: true })
  const pid = await readPidFile(home)
  t.teardown(() => ensureKilled(pid))
  t.teardown(() => runWithDir(home, ['stop']).catch(() => {}))

  const base = `http://127.0.0.1:${port}`
  await waitForPing(base)

  // First run bootstraps the cursor silently.
  const stdin = JSON.stringify({ cwd: '/fake/project' })
  const first = await runWithDir(home, ['hook', 'prompt-submit', '--port', String(port)], {
    input: stdin,
  })
  t.is(first.exitCode, 0)
  t.is(first.stdout.trim(), '', 'first run emits nothing')

  // Second run with no new peer activity is also silent.
  const second = await runWithDir(home, ['hook', 'prompt-submit', '--port', String(port)], {
    input: stdin,
  })
  t.is(second.exitCode, 0)
  t.is(second.stdout.trim(), '', 'no peer activity → still silent')
})

test('hook session-start: daemon unreachable → exit 0 with no output', async (t) => {
  const home = await tmpHome(t)
  const port = await getFreePort()
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })
  // Never start the daemon. The hook should degrade silently.
  const res = await runWithDir(home, ['hook', 'session-start', '--port', String(port)], {
    input: '',
  })
  t.is(res.exitCode, 0, 'exits 0 even when daemon is unreachable')
  t.is(res.stdout.trim(), '', 'no context injected')
  t.ok(res.stderr.length > 0, 'writes a diagnostic line to stderr')
})

test('hook session-start: no pacts → completely silent', async (t) => {
  const home = await tmpHome(t)
  // No init at all.
  const res = await runWithDir(home, ['hook', 'session-start'], { input: '' })
  t.is(res.exitCode, 0)
  t.is(res.stdout.trim(), '')
  t.is(res.stderr.trim(), '', 'no-pacts is a quiet no-op, not an error')
})
