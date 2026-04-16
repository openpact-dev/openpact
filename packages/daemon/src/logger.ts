/**
 * Pino logger plumbing for the daemon.
 *
 * Phase 3b moves all daemon and Fastify logs from raw `console.*` calls
 * to a structured Pino logger. By default we write JSON lines to a
 * file under `<dataDir>/logs/daemon.log` and a human-friendly
 * `pino-pretty` stream to stdout — operators see colourful logs in a
 * foreground terminal while monitoring tools get the canonical JSON
 * stream off-disk.
 *
 * `--log-level` and `--log-file` CLI flags (see `start-foreground.ts`)
 * let an operator dial verbosity or redirect the file sink. Setting
 * `--log-file=-` disables the file sink entirely (e.g. when the
 * supervisor already captures stdout).
 */
import { mkdir } from 'fs/promises'
import path from 'path'
import pino, { type Logger, type LoggerOptions, multistream, transport, destination } from 'pino'

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'

const LEVELS: ReadonlySet<LogLevel> = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
])

export function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && (LEVELS as Set<string>).has(value)
}

export interface LoggerOpts {
  /** One of pino's level names. Defaults to `info`. */
  level?: LogLevel
  /**
   * Absolute path to the JSON log sink. Defaults to
   * `<dataDir>/logs/daemon.log`. Pass `'-'` (or `null`) to skip the
   * file sink and only write to stdout.
   */
  file?: string | null
  /**
   * Daemon dataDir, used to compute the default file sink. Required
   * unless `file` is explicitly set.
   */
  dataDir?: string
  /**
   * When false, suppresses the pretty stdout sink (used by tests so
   * brittle's diff doesn't fight ANSI colours). Defaults to true.
   */
  pretty?: boolean
  /** When true, returns a silent logger that drops every record. Useful in tests. */
  silent?: boolean
}

export function defaultLogFile(dataDir: string): string {
  return path.join(dataDir, 'logs', 'daemon.log')
}

/**
 * Build a Pino logger that writes JSON to a file (default
 * `<dataDir>/logs/daemon.log`) and pretty-prints to stdout. The file
 * sink is created lazily on first write — its parent dir is mkdir-p'd
 * here so the very first record never fails on ENOENT.
 *
 * Returns a tuple of `[logger, close]` — call `close()` during
 * shutdown so any buffered records are flushed before the process
 * exits.
 */
export async function createLogger(opts: LoggerOpts = {}): Promise<{
  logger: Logger
  close: () => Promise<void>
}> {
  if (opts.silent) {
    const silent = pino({ level: 'silent' })
    return { logger: silent, close: async () => {} }
  }
  const level: LogLevel = opts.level ?? 'info'
  const usePretty = opts.pretty !== false
  const fileSink: string | null =
    opts.file === '-' ? null : (opts.file ?? (opts.dataDir ? defaultLogFile(opts.dataDir) : null))

  if (fileSink) {
    await mkdir(path.dirname(fileSink), { recursive: true })
  }

  const baseOpts: LoggerOptions = {
    level,
    base: { name: 'openpact-daemon' },
    timestamp: pino.stdTimeFunctions.isoTime,
  }

  // pino's transport / destination types don't extend Node's WritableStream literally
  // (ThreadStream, SonicBoom), but multistream accepts them. Loosen here.
  const streams: Array<{ level?: LogLevel; stream: any }> = []
  if (usePretty) {
    const pretty = transport({
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,name' },
    })
    streams.push({ level, stream: pretty })
  }
  if (fileSink) {
    streams.push({ level, stream: destination({ dest: fileSink, sync: false, mkdir: false }) })
  }
  if (streams.length === 0) {
    streams.push({ level, stream: process.stdout })
  }

  const logger = pino(baseOpts, multistream(streams))

  const close = async () => {
    // Flush each underlying destination. `flush` is async but pino's
    // sync streams resolve immediately.
    for (const { stream } of streams) {
      const flushable = stream as NodeJS.WritableStream & { flushSync?: () => void }
      try {
        flushable.flushSync?.()
      } catch {
        /* sink already closed */
      }
    }
  }

  return { logger, close }
}
