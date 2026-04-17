import { WatchingEye } from './WatchingEye'
import { ThemeDial } from './ThemeDial'

interface NavItem {
  href: string
  label: string
  external?: boolean
}

const NAV: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/docs/', label: 'Docs' },
  { href: 'https://github.com/openpact-dev/openpact', label: 'GitHub', external: true },
]

interface Props {
  current?: 'home' | 'docs' | 'join' | null
}

export function Header({ current }: Props) {
  return (
    <header class="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-canvas)]/80 backdrop-blur-md">
      <div class="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-6 py-3.5">
        <div class="flex items-center gap-2.5">
          <a href="/" class="group flex items-center gap-2.5" aria-label="OpenPact home">
            <WatchingEye size={28} />
            <span class="font-display text-[19px] font-medium tracking-tight text-[var(--color-ink)]">
              OpenPact
            </span>
          </a>
          <a
            href="/docs/releases/"
            class="hidden items-center border-[0.5px] border-[var(--color-ember)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ember)] transition-colors hover:bg-[var(--color-ember)]/10 sm:inline-flex"
            title="View release notes"
          >
            v0.1 alpha
          </a>
        </div>

        <nav class="flex items-center gap-1 sm:gap-2">
          {NAV.map((item) => {
            const active =
              (item.label === 'Home' && current === 'home') ||
              (item.label === 'Docs' && current === 'docs')
            return (
              <a
                key={item.href}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                class={`group relative px-3 py-1.5 text-sm font-medium transition-colors hover:text-[var(--color-ember)] ${
                  active ? 'text-[var(--color-ember)]' : 'text-[var(--color-ink2)]'
                }`}
              >
                <span>{item.label}</span>
                {item.external ? (
                  <span
                    aria-hidden="true"
                    class={`ml-1 transition-colors ${active ? 'text-[var(--color-ember)]' : 'text-[var(--color-ink3)] group-hover:text-[var(--color-ember)]'}`}
                  >
                    ↗
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  class={`pointer-events-none absolute -bottom-[1px] left-3 right-3 h-px origin-left bg-[var(--color-ember)] transition-transform duration-200 ease-out ${
                    active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                />
              </a>
            )
          })}
          <span class="mx-2 hidden h-5 w-px bg-[var(--color-line)] sm:block" />
          <ThemeDial />
        </nav>
      </div>
    </header>
  )
}
