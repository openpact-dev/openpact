import { execa, type Options, type ExecaReturnValue } from 'execa'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const BIN = path.resolve(__dirname, '../../../bin/openpact.js')

export async function tmpHome(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-cli-e2e-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

export interface RunOpts extends Options {
  reject?: boolean
}

export async function runCli(
  args: string[],
  { reject = false, ...opts }: RunOpts = {},
): Promise<ExecaReturnValue> {
  return execa('node', [BIN, ...args], {
    reject,
    timeout: 30_000,
    ...opts,
  })
}

/**
 * Run the CLI with a specific data dir. Most e2e tests want this.
 */
export async function runWithDir(
  dir: string,
  args: string[],
  opts: RunOpts = {},
): Promise<ExecaReturnValue> {
  return runCli(['--data-dir', dir, ...args], opts)
}

/**
 * Read the daemon's bearer token from `daemon.json`. Tests that talk to the
 * REST API directly via `fetch()` (instead of going through the CLI) need this
 * because every non-public route enforces the `Authorization: Bearer <token>`
 * header under the Phase-1b auth regime.
 */
export async function readApiToken(dir: string): Promise<string> {
  const raw = await fs.readFile(path.join(dir, 'daemon.json'), 'utf8')
  const parsed = JSON.parse(raw) as { apiToken?: string | null }
  if (!parsed.apiToken) throw new Error(`no apiToken in ${dir}/daemon.json yet`)
  return parsed.apiToken
}

/**
 * Headers object with the bearer token attached. Saves each test from
 * re-writing the token-read boilerplate.
 */
export async function authHeaders(
  dir: string,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await readApiToken(dir)
  return { authorization: `Bearer ${token}`, ...extra }
}
