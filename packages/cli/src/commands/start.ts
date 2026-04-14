import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { pidFileLooksAlive, writePidFile, pidPath } from '../lib/pid'
import { startForegroundCmd } from './start-foreground'

export interface StartOpts {
  daemon?: boolean
  port?: string | number
  bootstrap?: string
}

export async function startCmd(
  opts: StartOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())

  if (await pidFileLooksAlive(dir)) {
    throw new Error(
      `a daemon already appears to be running (PID file at ${pidPath(dir)}). Run \`openpact stop\` first.`,
    )
  }

  if (!opts.daemon) {
    await startForegroundCmd(opts, cmd)
    return
  }

  // Detached path: spawn ourselves as start-foreground.
  await fs.mkdir(dir, { recursive: true })
  const logPath = path.join(dir, 'daemon.log')
  const logFd = await fs.open(logPath, 'a')

  const childArgs = [
    process.argv[1], // bin/openpact.js
    '--data-dir',
    dir,
    'start-foreground',
    ...(opts.port ? ['--port', String(opts.port)] : []),
    ...(opts.bootstrap ? ['--bootstrap', opts.bootstrap] : []),
  ]

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: ['ignore', logFd.fd, logFd.fd],
    env: { ...process.env, OPENPACT_DATA_DIR: dir },
  })
  child.unref()
  await logFd.close()

  if (!child.pid) {
    throw new Error('failed to spawn detached daemon')
  }

  // Give the child a brief moment to either crash or write its own pid.
  // We write our best-guess pid immediately so subsequent commands see it
  // even if the child hasn't run startForegroundCmd yet.
  await writePidFile(dir, child.pid)

  console.log(pc.green(`openpact daemon started`))
  console.log(`  ${pc.bold('PID:')}      ${child.pid}`)
  console.log(`  ${pc.bold('Data dir:')} ${dir}`)
  console.log(`  ${pc.bold('Logs:')}     ${logPath}`)
}
