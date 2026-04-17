import net from 'net'
import { stripVTControlCharacters } from 'util'
import { tmpHome, runWithDir } from './run-cli'
import { readPidFile, isAlive } from '../../../src/lib/pid'

/**
 * Shared boot helpers for the e2e write-verb suites. Lifted out of
 * the old monolithic `write-verbs.test.ts` so splitting the file into
 * focused shards doesn't duplicate this plumbing. Every helper here
 * is safe to call in parallel across test files — nothing touches
 * shared state beyond whatever `tmpHome`/`getFreePort` allocate.
 */

export interface Env {
  home: string
  port: number
  base: string
}

/** Parse the task id out of `op task add` stdout (stripped of ANSI colors). */
export function extractTaskId(stdout: string): string {
  const match = stripVTControlCharacters(stdout).match(/Task\s+(\S+)/)
  if (!match) throw new Error(`no task id found in stdout: ${stdout}`)
  return match[1]
}

export async function ensureKilled(pid: number | null): Promise<void> {
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
}

export async function getFreePort(): Promise<number> {
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

export async function waitForPing(base: string, timeout = 15_000): Promise<void> {
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

/**
 * Boot a fresh daemon with one pact aliased to `default`. Schedules
 * teardown (stop + SIGKILL fallback) on the test context.
 */
export async function bootPact(t: any): Promise<Env> {
  const home = await tmpHome(t)
  const port = await getFreePort()
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })
  await runWithDir(home, ['start', '--no-dashboard', '--port', String(port)], { reject: true })
  const pid = await readPidFile(home)
  t.teardown(() => ensureKilled(pid))
  t.teardown(() => runWithDir(home, ['stop']).catch(() => {}))
  const base = `http://127.0.0.1:${port}`
  await waitForPing(base)
  return { home, port, base }
}
