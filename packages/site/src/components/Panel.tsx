import type { ComponentChildren } from 'preact'
import { CornerBracket } from './WatchingEye'

interface Props {
  eyebrow?: string
  title?: string
  children: ComponentChildren
  ornaments?: boolean
  class?: string
}

/**
 * Codex panel — corner brackets, eyebrow + title header, hairline
 * divider. Slightly loosened from the dashboard variant so marketing
 * copy has room to breathe.
 */
export function Panel({ eyebrow, title, children, ornaments = true, class: cls = '' }: Props) {
  return (
    <section class={`relative bg-[var(--color-paper)]/50 backdrop-blur-[2px] ${cls}`}>
      {ornaments && (
        <>
          <CornerBracket pos="tl" />
          <CornerBracket pos="tr" />
          <CornerBracket pos="bl" />
          <CornerBracket pos="br" />
        </>
      )}

      {(eyebrow || title) && (
        <>
          <header class="px-6 pt-5 pb-2.5">
            {eyebrow ? <div class="eyebrow mb-1">{eyebrow}</div> : null}
            {title ? (
              <h2 class="font-display text-xl font-medium leading-tight text-[var(--color-ink)]">
                {title}
              </h2>
            ) : null}
          </header>
          <div class="mx-6 h-px bg-[var(--color-line)]" />
        </>
      )}

      <div class="px-6 py-5">{children}</div>
    </section>
  )
}
