/**
 * Per-test daemon + dashboard fixture for Playwright.
 *
 * Playwright doesn't run under tsx, so we can't import `@openpact/daemon`
 * directly (its `main` field points at `src/index.js` which only exists
 * via tsx in dev). Instead we spawn the CLI as a subprocess — same path
 * a real user would take — and tear it down at fixture teardown.
 *
 * Each test gets:
 *   - a fresh tmp data dir + daemon process bound on a free port
 *   - a dashboard server bound on a free port pointing at that daemon
 *   - an `OpenPact` SDK client pointing at the daemon directly (so
 *     test seed data round-trips through the published REST surface
 *     rather than the proxy)
 */
import { test as base } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { OpenPact } from '@openpact/sdk'
import { startDashboard, type StartDashboardResult } from '../../../server/index'

let nextDaemonPort = 30100

export interface DashboardFixture {
  baseURL: string
  daemonPort: number
  pact: OpenPact
}

const STATIC_DIR = path.resolve(process.cwd(), 'dist', 'browser')
const CLI_BIN = path.resolve(process.cwd(), '..', 'cli', 'bin', 'openpact.js')

async function waitForPing(port: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/ping`)
      if (res.ok) return
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`daemon never bound to :${port}`)
}

async function killProcess(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode != null) return
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* gone */
      }
      resolve()
    }, 1500)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

export const test = base.extend<{ dashboardFixture: DashboardFixture }>({
  // eslint-disable-next-line no-empty-pattern
  dashboardFixture: async ({}, use) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-pw-'))
    const daemonPort = nextDaemonPort++

    // Init the pact in this dir, then spawn a foreground daemon.
    const init = spawn(process.execPath, [CLI_BIN, '--data-dir', dir, 'init'], { stdio: 'pipe' })
    await new Promise<void>((resolve, reject) => {
      init.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`init failed exit=${code}`)),
      )
    })

    const child = spawn(
      process.execPath,
      [
        CLI_BIN,
        '--data-dir',
        dir,
        'start-foreground',
        '--port',
        String(daemonPort),
        '--no-dashboard',
      ],
      { stdio: 'pipe' },
    )
    // Surface child stderr if the daemon fails to start (helps diagnose).
    child.stderr?.on('data', (b) => process.stderr.write(`[daemon] ${b}`))

    await waitForPing(daemonPort)

    let dash: StartDashboardResult | null = null
    try {
      dash = await startDashboard({
        daemonPort,
        port: 0,
        staticDir: STATIC_DIR,
      })
      const pact = new OpenPact({ port: daemonPort })
      await use({ baseURL: dash.url, daemonPort, pact })
    } finally {
      if (dash) await dash.close()
      await killProcess(child)
      await fs.rm(dir, { recursive: true, force: true })
    }
  },
})

export { expect } from '@playwright/test'
