import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export interface HookCursor {
  /** ISO timestamp of the most recent entry this project has surfaced to Claude. */
  lastSeen: string
  /** Pact alias the cursor was recorded against. Scoped so switching pacts resets. */
  pactId: string
  /** Absolute cwd the cursor was written from. Recorded for debugging only. */
  cwd: string
}

/**
 * Build the on-disk path for this project+pact's cursor. Hashed so
 * absurdly long project paths never exceed filesystem limits, and
 * distinct pacts-in-the-same-cwd get separate cursors.
 */
export function cursorPath(hostDir: string, cwd: string, pactId: string): string {
  const key = crypto.createHash('sha256').update(`${cwd}\0${pactId}`).digest('hex').slice(0, 16)
  return path.join(hostDir, 'hooks', `${key}.json`)
}

/** Read a cursor from disk. Returns null when missing or unreadable. */
export async function readCursor(file: string): Promise<HookCursor | null> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HookCursor>
    if (
      typeof parsed.lastSeen !== 'string' ||
      typeof parsed.pactId !== 'string' ||
      typeof parsed.cwd !== 'string'
    ) {
      return null
    }
    return parsed as HookCursor
  } catch {
    return null
  }
}

/** Atomic write: tmp + rename, so a crashed write never leaves a truncated cursor. */
export async function writeCursor(file: string, cursor: HookCursor): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(cursor, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, file)
}
