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
