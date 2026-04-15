import { CopyButton } from './CopyButton'

interface Props {
  code: string
  language?: string
  title?: string
  copyValue?: string
  class?: string
}

/**
 * Monospaced terminal-style block with an optional title bar and copy
 * button. No syntax highlighting; keeps the bundle tiny.
 */
export function CodeBlock({ code, language, title, copyValue, class: cls = '' }: Props) {
  return (
    <div
      class={`group relative my-5 overflow-hidden border border-[var(--color-line)] bg-[var(--color-paper)] shadow-[0_2px_18px_-10px_var(--color-ember-glow)] ${cls}`}
    >
      {(title || language) && (
        <div class="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-1.5 bg-[var(--color-canvas)]">
          <div class="flex items-center gap-2">
            <span class="flex gap-1">
              <span class="h-2 w-2 rounded-full bg-[var(--color-ember)] opacity-70" />
              <span class="h-2 w-2 rounded-full bg-[var(--color-deckle)]" />
              <span class="h-2 w-2 rounded-full bg-[var(--color-deckle)]" />
            </span>
            {title ? <span class="smallcaps">{title}</span> : null}
          </div>
          <CopyButton value={copyValue ?? code} />
        </div>
      )}
      <pre class="m-0 overflow-x-auto px-4 py-3 font-mono text-[12px] leading-[1.55] text-[var(--color-ink)]">
        <code>{code}</code>
      </pre>
      {!title && !language && (
        <div class="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton value={copyValue ?? code} />
        </div>
      )}
    </div>
  )
}
