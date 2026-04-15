import type { ComponentChildren } from 'preact'
import { CornerBracket } from './Ornament'

interface Props {
  /** Italic eyebrow above the title (e.g. "II.") */
  eyebrow?: string
  title: string
  link?: { label: string; href: string }
  children: ComponentChildren
  /** Add the brass corner brackets to the panel. Defaults to true. */
  ornaments?: boolean
}

/**
 * Codex panel — corner brackets, eyebrow + title header, and a thin
 * ember underline on the title. The body sits on the paper surface
 * with a subtle inset shadow above to suggest a folded leaf.
 */
export function Panel({ eyebrow, title, link, children, ornaments = true }: Props) {
  return (
    <section class="relative">
      {ornaments && <CornerBracket pos="tl" />}
      {ornaments && <CornerBracket pos="tr" />}
      {ornaments && <CornerBracket pos="bl" />}
      {ornaments && <CornerBracket pos="br" />}

      <header class="flex items-end justify-between gap-4 px-5 pb-2.5 pt-4">
        <div>
          {eyebrow ? <div class="eyebrow mb-0.5">{eyebrow}</div> : null}
          <h2 class="font-display text-[17px] font-medium leading-none tracking-tight text-[var(--color-ink)]">
            {title}
          </h2>
        </div>
        {link ? (
          <a
            href={link.href}
            class="group font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink2)] hover:text-[var(--color-ember)]"
          >
            <span class="ember-underline">{link.label}</span>
            <span class="ml-1.5">→</span>
          </a>
        ) : null}
      </header>

      <div class="mx-5 h-px bg-[var(--color-line)]" />

      <div>{children}</div>
    </section>
  )
}
