import { Router } from 'preact-router'
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
            <Pacts
              path="/pacts"
              current={current}
              pacts={pacts}
              onChange={() => void refresh()}
            />
            <Trace path="/trace/:id" />
            <NotFound default />
          </Router>
        </main>
      </div>
    </PactContext.Provider>
  )
}
