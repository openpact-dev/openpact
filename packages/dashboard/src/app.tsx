import { Router } from 'preact-router'
import { Toaster } from 'sonner'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Knowledge } from './pages/Knowledge'
import { Tasks } from './pages/Tasks'
import { Messages } from './pages/Messages'
import { Skills } from './pages/Skills'
import { Network } from './pages/Network'
import { Trace } from './pages/Trace'
import { Pacts } from './pages/Pacts'
import { useCurrentPact } from './hooks/useCurrentPact'
import { PactContext, pactClient, hostPact } from './hooks/usePact'
import { useTheme } from './hooks/useTheme'
import { useActivityToasts } from './hooks/useActivityToasts'

function NotFound() {
  return (
    <section class="mx-auto max-w-[720px] pt-16 text-center">
      <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
        404
      </div>
      <h1 class="mt-2 font-display text-[36px] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
        Page not found
      </h1>
      <p class="mt-4 text-[14px] text-[var(--color-ink2)]">No route matches this URL.</p>
    </section>
  )
}

export function App() {
  // The pact switcher state lives at the top so a single context covers
  // both the sidebar and the page. Switching the pact updates `current`
  // and, via the keyed PactContext below, every consumer's `usePact()`
  // call returns the new client (which bumps useQuery cache keys).
  const { current, pacts, setCurrent, refresh } = useCurrentPact()
  const client = current ? pactClient(current) : hostPact()

  return (
    <PactContext.Provider value={client}>
      <div class="relative z-10 flex min-h-screen">
        <div class="sticky top-0 h-screen shrink-0">
          <Sidebar
            current={current}
            pacts={pacts}
            onSelect={(alias) => {
              void setCurrent(alias)
            }}
          />
        </div>
        <main class="min-w-0 flex-1 px-10 py-8" key={current ?? '__no-pact__'}>
          <Router>
            <Dashboard path="/" />
            <Knowledge path="/knowledge" />
            <Tasks path="/tasks" />
            <Messages path="/messages" />
            <Skills path="/skills" />
            <Network path="/network" />
            <Pacts path="/pacts" current={current} pacts={pacts} onChange={() => void refresh()} />
            <Trace path="/trace/:id" />
            <NotFound default />
          </Router>
        </main>
      </div>
      <ActivityBridge />
      <ThemedToaster />
    </PactContext.Provider>
  )
}

/** Subscribes to SSE and fires toasts for non-self activity. */
function ActivityBridge() {
  useActivityToasts(true)
  return null
}

/**
 * Sonner Toaster mounted bottom-right, themed via `toastOptions.classNames`
 * to match the codex aesthetic. Uses our resolved theme so the chrome
 * flips between light and dark with the rest of the UI.
 */
function ThemedToaster() {
  const { resolved } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={resolved}
      offset={20}
      gap={10}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'op-toast pointer-events-auto flex items-start gap-3 border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3 w-[340px] backdrop-blur-sm',
          title: 'font-display text-[14px] leading-tight text-[var(--color-ink)]',
          description: 'mt-1 text-[12px] leading-[1.4] text-[var(--color-ink2)]',
          icon: 'mt-0.5 text-[var(--color-ember)]',
          closeButton:
            'border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink2)] hover:text-[var(--color-ember)]',
        },
      }}
    />
  )
}
