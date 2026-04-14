import fs from 'fs/promises'
import { dataDir as daemonDataDir } from '@openpact/daemon'

export function pidPath(dir: string): string {
  return daemonDataDir.pidPath(dir)
}

export async function writePidFile(dir: string, pid: number): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(pidPath(dir), String(pid) + '\n', 'utf8')
}

export async function readPidFile(dir: string): Promise<number | null> {
  let raw: string
  try {
    raw = await fs.readFile(pidPath(dir), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

export async function removePidFile(dir: string): Promise<void> {
  try {
    await fs.unlink(pidPath(dir))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

/**
 * Returns true if the process is alive. Uses the standard Unix trick of
 * sending signal 0 — `process.kill(pid, 0)` performs the existence check
 * without delivering a signal. Throws ESRCH when the process is gone.
 */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

export async function pidFileLooksAlive(dir: string): Promise<boolean> {
  const pid = await readPidFile(dir)
  if (pid === null) return false
  return isAlive(pid)
}
