import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Daemon, type DaemonOpts, type JoinOpts } from '../../src/daemon'

export interface TmpDaemonOpts extends DaemonOpts {
  joinKey?: string
  start?: boolean
}

export interface TmpDaemonResult {
  daemon: Daemon
  dir: string
}

export async function makeTmpDir(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-d-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

export async function tmpDaemon(t: any, opts: TmpDaemonOpts = {}): Promise<TmpDaemonResult> {
  const dir = await makeTmpDir(t)
  const daemon = opts.joinKey
    ? await Daemon.join({ dataDir: dir, ...(opts as JoinOpts) })
    : await Daemon.create({ dataDir: dir, ...opts })
  if (opts.start !== false) await daemon.start()
  t.teardown(() => daemon.stop())
  return { daemon, dir }
}
