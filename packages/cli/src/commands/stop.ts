import pc from 'picocolors'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { readPidFile, isAlive, removePidFile } from '../lib/pid'

export interface StopOpts {
  timeout?: string | number
}

export async function stopCmd(
  opts: StopOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const pid = await readPidFile(dir)
  if (pid === null) {
    console.error(pc.dim('no PID file — daemon does not appear to be running'))
    return
  }

  if (!isAlive(pid)) {
    console.error(pc.dim(`stale PID file (pid ${pid} is not running) — cleaning up`))
    await removePidFile(dir)
    return
  }

  process.kill(pid, 'SIGTERM')

  const timeout = Number(opts.timeout ?? 5000)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (!isAlive(pid)) break
    await new Promise((r) => setTimeout(r, 100))
  }

  if (isAlive(pid)) {
    console.error(pc.yellow(`daemon ${pid} did not exit within ${timeout}ms; sending SIGKILL`))
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }

  await removePidFile(dir)
  console.log(pc.green(`openpact daemon stopped (pid ${pid})`))
}
