import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { readPidFile, isAlive, removePidFile } from '../lib/pid'
import { c, emoji, ashes } from '../lib/theme'

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
    console.error(c.ash('no PID file. no daemon to banish.'))
    return
  }

  if (!isAlive(pid)) {
    console.error(c.ash(`stale PID file (pid ${pid} is gone). cleaning up.`))
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
    console.error(c.ember(`daemon ${pid} did not exit within ${timeout}ms. forcing SIGKILL.`))
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }

  await removePidFile(dir)
  console.log()
  console.log(ashes())
  console.log()
  console.log(
    `  ${emoji.bones} ${c.brandBold('The daemon has been banished.')} ${c.ash(`(pid ${pid})`)}`,
  )
}
