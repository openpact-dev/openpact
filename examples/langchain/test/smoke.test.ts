/**
 * Boots a tmp daemon on an ephemeral port, sets OPENPACT_URL in the
 * env, then shells out to pytest to run the Python loader against it.
 *
 * Python is optional; if `python3 -c "import pytest, requests"` fails,
 * the smoke test passes with a "skipped" message. The Linux CI matrix
 * slot installs Python explicitly so we always exercise the real path
 * there.
 */
import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { Daemon, createApi, bind } from '@openpact/daemon'

const run = promisify(execFile)
const ROOT = path.resolve(__dirname, '..')

let nextPort = 21200

async function pythonAvailable(): Promise<{ python: string; ok: boolean; reason?: string }> {
  for (const python of ['python3', 'python']) {
    try {
      await run(python, ['-c', 'import pytest, requests'])
      return { python, ok: true }
    } catch (err: any) {
      // Try the next interpreter; record the reason for the skip message.
      if (err?.code === 'ENOENT') continue
      return { python, ok: false, reason: err?.stderr || String(err?.message) }
    }
  }
  return { python: '', ok: false, reason: 'no python with pytest + requests found' }
}

test('langchain example: pytest against a live daemon (skips if python unavailable)', async (t) => {
  const env = await pythonAvailable()
  if (!env.ok) {
    t.pass(`python smoke skipped: ${env.reason ?? 'unavailable'}`)
    return
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-langchain-'))
  const daemon = await Daemon.create({ dataDir: dir })
  // await daemon.start() — skipped: no swarm needed for HTTP-only tests
  const app = createApi(daemon)
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })
  t.teardown(async () => {
    await app.close()
    await daemon.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })

  const result = await run(env.python, ['-m', 'pytest', '-x', '-q', 'tests'], {
    cwd: ROOT,
    env: { ...process.env, OPENPACT_URL: `http://127.0.0.1:${port}` },
    maxBuffer: 1024 * 1024 * 4,
  })
  // Bubble pytest output for visibility on failures, asserting it ran.
  t.ok(result.stdout.includes('passed'), `pytest output:\n${result.stdout}`)
})
