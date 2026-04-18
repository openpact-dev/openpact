import fs from 'fs'
import path from 'path'

/**
 * Locate `@openpact/cli`'s package.json without hard-coding a depth.
 * `__dirname` differs between tsx dev (`src/lib/`) and published
 * builds (`dist/cjs/lib/`), so walk a few candidates and pick the
 * first whose package.json matches this package's name. Falls back
 * to 0.0.0 if nothing matches — keeps the CLI working if the file is
 * missing for some reason rather than crashing on startup.
 */
export function readCliVersion(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'package.json'),
    path.resolve(__dirname, '..', '..', 'package.json'),
    path.resolve(__dirname, '..', '..', '..', 'package.json'),
  ]
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as {
        name?: string
        version?: string
      }
      if (parsed.name === '@openpact/cli' && typeof parsed.version === 'string') {
        return parsed.version
      }
    } catch {
      // try the next path
    }
  }
  return '0.0.0'
}

export const CLI_VERSION = readCliVersion()
