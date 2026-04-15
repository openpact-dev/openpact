import { render } from 'preact'
import { applyInitialTheme } from '../hooks/useTheme'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { WatchingEye } from '../components/WatchingEye'
import '../style.css'

applyInitialTheme()

function NotFound() {
  return (
    <>
      <Header current={null} />
      <main class="relative z-10">
        <section class="mx-auto flex max-w-[820px] flex-col items-center px-6 py-28 text-center">
          <WatchingEye size={72} />
          <div class="eyebrow mt-6">404 · banished</div>
          <h1 class="mt-2 font-display text-[clamp(2.8rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-tight text-[var(--color-ink)]">
            The daemon does not know this page.
          </h1>
          <p class="mt-4 max-w-md text-lg text-[var(--color-ink2)] leading-relaxed">
            The link may have been mistyped, the entry removed from the log, or the pact you were
            pointed at is sealed to you.
          </p>
          <div class="mt-8 flex gap-3">
            <a
              href="/"
              class="inline-flex items-center gap-2 bg-[var(--color-ember)] px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-paper)]"
            >
              Home
            </a>
            <a
              href="/docs/"
              class="inline-flex items-center gap-2 border border-[var(--color-line)] px-5 py-2.5 text-sm font-medium tracking-wide text-[var(--color-ink)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
            >
              Docs
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

const root = document.getElementById('app')
if (root) render(<NotFound />, root)
