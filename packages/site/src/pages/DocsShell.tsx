import type { ComponentChildren } from 'preact'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

export interface DocMeta {
  slug: string
  title: string
  description: string
}

export const DOC_NAV: DocMeta[] = [
  { slug: '/docs/', title: 'Overview', description: 'What OpenPact is and why.' },
  {
    slug: '/docs/getting-started/',
    title: 'Getting started',
    description: 'Install, seal a pact, pair two daemons.',
  },
  {
    slug: '/docs/architecture/',
    title: 'Architecture',
    description: 'Entries, peers, roles, and the view.',
  },
  {
    slug: '/docs/cli/',
    title: 'CLI reference',
    description: 'Every openpact verb and its flags.',
  },
  {
    slug: '/docs/dashboard/',
    title: 'Dashboard',
    description: 'The local web UI on :7667. Screens, live updates, and destructive actions.',
  },
  {
    slug: '/docs/rest-api/',
    title: 'REST API',
    description: 'Every route, with request and response shapes.',
  },
  {
    slug: '/docs/packages/',
    title: 'Packages',
    description: 'The monorepo: daemon, CLI, SDK, MCP, skill, dashboard, site.',
  },
  {
    slug: '/docs/skill/',
    title: 'Skill package',
    description: 'Portable SKILL.md + tools.json for any agent runtime.',
  },
  {
    slug: '/docs/examples/',
    title: 'Examples',
    description: 'Worked integrations for every major agent framework.',
  },
  {
    slug: '/docs/releases/',
    title: 'Release notes',
    description: 'An append-only log of what shipped, when. Newest first.',
  },
]

interface Props {
  currentSlug: string
  eyebrow?: string
  title: string
  lede?: string
  children: ComponentChildren
}

export function DocsShell({ currentSlug, eyebrow, title, lede, children }: Props) {
  const idx = DOC_NAV.findIndex((d) => d.slug === currentSlug)
  const prev = idx > 0 ? DOC_NAV[idx - 1] : null
  const next = idx >= 0 && idx < DOC_NAV.length - 1 ? DOC_NAV[idx + 1] : null

  return (
    <>
      <Header current="docs" />
      <main class="relative z-10">
        <div class="mx-auto grid max-w-[1200px] gap-10 px-6 py-10 md:grid-cols-[220px_1fr] md:py-14">
          <aside class="md:sticky md:top-20 md:self-start">
            <div class="eyebrow mb-3">Docs</div>
            <nav class="flex flex-col gap-1 border-l border-[var(--color-line)]">
              {DOC_NAV.map((d) => {
                const active = d.slug === currentSlug
                return (
                  <a
                    key={d.slug}
                    href={d.slug}
                    class={`group -ml-px border-l-2 px-4 py-1.5 text-sm transition-colors ${
                      active
                        ? 'border-[var(--color-ember)] text-[var(--color-ember)] font-medium'
                        : 'border-transparent text-[var(--color-ink2)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink3)]'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {d.title}
                  </a>
                )
              })}
            </nav>
          </aside>

          <article class="prose max-w-[720px] animate-etch">
            {eyebrow ? <div class="eyebrow mb-2">{eyebrow}</div> : null}
            <h1 class="!mb-3">{title}</h1>
            {lede ? (
              <p class="text-lg italic text-[var(--color-ink2)] leading-relaxed border-l-2 border-[var(--color-ember)] pl-4 !mt-4 !mb-8">
                {lede}
              </p>
            ) : null}

            {children}

            {(prev || next) && (
              <nav class="mt-14 grid grid-cols-1 gap-3 border-t border-[var(--color-line)] pt-6 sm:grid-cols-2">
                {prev ? (
                  <a
                    href={prev.slug}
                    class="group flex flex-col gap-1 border border-[var(--color-line)] px-4 py-3 transition-colors hover:border-[var(--color-ember)]"
                  >
                    <span class="smallcaps">← Previous</span>
                    <span class="font-display text-base text-[var(--color-ink)] group-hover:text-[var(--color-ember)]">
                      {prev.title}
                    </span>
                  </a>
                ) : (
                  <span />
                )}
                {next ? (
                  <a
                    href={next.slug}
                    class="group flex flex-col gap-1 border border-[var(--color-line)] px-4 py-3 text-right transition-colors hover:border-[var(--color-ember)]"
                  >
                    <span class="smallcaps">Next →</span>
                    <span class="font-display text-base text-[var(--color-ink)] group-hover:text-[var(--color-ember)]">
                      {next.title}
                    </span>
                  </a>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </article>
        </div>
      </main>
      <Footer />
    </>
  )
}
