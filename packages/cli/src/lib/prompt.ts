import prompts from 'prompts'

/**
 * TTY-aware prompt wrapper used by `init` and `join`.
 *
 * When a value is already set via CLI flag, it's returned as-is.
 * When the caller asked for non-interactive mode, or when stdin
 * isn't a TTY (scripted/piped), the default is returned silently.
 * Otherwise we prompt with the themed default pre-filled so
 * hitting enter commits it.
 */

interface AskOpts {
  /** CLI-flag value. If defined, short-circuits — no prompt. */
  provided?: string | null | undefined
  /** `true` forces no prompt, even on a TTY. */
  nonInteractive?: boolean
  /** Default / suggestion shown in the prompt and returned when skipped. */
  default: string
  /** Prompt label; appears before the input field. */
  label: string
  /** Optional max length (passed through for light-touch client-side validation). */
  max?: number
}

export async function askText(opts: AskOpts): Promise<string> {
  // Explicit flag wins.
  if (typeof opts.provided === 'string' && opts.provided.trim() !== '') {
    return opts.provided.trim()
  }
  // Not a TTY → silent default. Same for --no-interactive.
  if (opts.nonInteractive || !process.stdin.isTTY) {
    return opts.default
  }
  const res = await prompts(
    {
      type: 'text',
      name: 'value',
      message: opts.label,
      initial: opts.default,
      validate: (v: string) => {
        if (opts.max !== undefined && v.length > opts.max) {
          return `must be ≤${opts.max} chars`
        }
        return true
      },
    },
    {
      // If the user hits Ctrl+C, fall back to the default rather than
      // throwing — init/join should be nearly impossible to fail.
      onCancel: () => false,
    },
  )
  const value = typeof res.value === 'string' ? res.value.trim() : ''
  return value || opts.default
}

/** Whether prompts should run, given flags + TTY. */
export function isInteractive(nonInteractive?: boolean): boolean {
  if (nonInteractive) return false
  return !!process.stdin.isTTY
}
