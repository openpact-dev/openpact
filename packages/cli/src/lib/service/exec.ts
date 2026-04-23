import { execFile } from 'child_process'
import { promisify } from 'util'

const pExecFile = promisify(execFile)

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

/**
 * Run a command and collect stdout/stderr without throwing on non-zero exit.
 * Callers often want to branch on exit code (e.g. `systemctl is-active`
 * returns 3 for "inactive"), so we surface `code` instead of raising.
 */
export async function run(
  bin: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await pExecFile(bin, args, {
      env: opts.env ?? process.env,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { stdout, stderr, code: 0 }
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number }
    if (e.code === 'ENOENT') {
      throw new Error(`${bin}: command not found`)
    }
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: typeof e.code === 'number' ? e.code : 1,
    }
  }
}
