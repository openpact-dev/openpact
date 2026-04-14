import { c } from './theme'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const INTERVAL_MS = 80

/**
 * Tiny TTY-aware spinner. Renders nothing when stdout isn't a TTY (CI,
 * pipes, redirected output) — the caller still sees `start()`/`stop()`
 * effects via stdout writes that just collapse to empty strings.
 *
 * No external dep — modern ESM spinners (yocto-spinner, ora) drag CJS
 * compatibility issues into our tsx shim that aren't worth the size win.
 */
export class Spinner {
  private text: string
  private frame = 0
  private timer: NodeJS.Timeout | null = null
  private active = false
  private readonly tty: boolean

  constructor(text: string) {
    this.text = text
    this.tty = process.stdout.isTTY === true && !process.env.CI && !process.env.NO_SPINNER
  }

  start(): this {
    if (this.active) return this
    this.active = true
    if (!this.tty) {
      // Non-TTY: emit one line, no animation.
      process.stdout.write(`${c.brand('·')} ${this.text}\n`)
      return this
    }
    this.render()
    this.timer = setInterval(() => this.render(), INTERVAL_MS)
    return this
  }

  update(text: string): this {
    this.text = text
    if (this.tty && this.active) this.render()
    return this
  }

  succeed(text?: string): void {
    this.finish(c.brand('🜏'), text ?? this.text)
  }

  fail(text?: string): void {
    this.finish(c.ember('✗'), text ?? this.text)
  }

  stop(): void {
    if (!this.active) return
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.active = false
    if (this.tty) this.clearLine()
  }

  private finish(symbol: string, text: string): void {
    if (!this.active) return
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.active = false
    if (this.tty) this.clearLine()
    process.stdout.write(`${symbol} ${text}\n`)
  }

  private render(): void {
    const f = FRAMES[this.frame++ % FRAMES.length]
    process.stdout.write(`\r${c.brand(f)} ${this.text}`)
  }

  private clearLine(): void {
    process.stdout.write('\r\x1b[K')
  }
}

export function spinner(text: string): Spinner {
  return new Spinner(text)
}
