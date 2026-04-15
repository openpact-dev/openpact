import type { ComponentChildren } from 'preact'

interface Props {
  title: string
  link?: { label: string; href: string }
  children: ComponentChildren
}

/** White panel with a thin header bar — matches the mockup's .panel pattern. */
export function Panel({ title, link, children }: Props) {
  return (
    <div class="overflow-hidden rounded-[12px] border-[0.5px] border-line bg-paper">
      <div class="flex items-center justify-between border-b-[0.5px] border-line px-[18px] py-[13px]">
        <span class="text-[13px] font-medium text-ink">{title}</span>
        {link ? (
          <a href={link.href} class="text-[12px] text-purple no-underline hover:text-purple-deep">
            {link.label}
          </a>
        ) : null}
      </div>
      {children}
    </div>
  )
}
