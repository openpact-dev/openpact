import { Router } from 'preact-router'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Knowledge } from './pages/Knowledge'
import { Tasks } from './pages/Tasks'
import { Skills } from './pages/Skills'
import { Network } from './pages/Network'
import { Trace } from './pages/Trace'

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
  return (
    <div class="relative z-10 flex min-h-screen">
      <div class="sticky top-0 h-screen shrink-0">
        <Sidebar />
      </div>
      <main class="min-w-0 flex-1 px-10 py-8">
        <Router>
          <Dashboard path="/" />
          <Knowledge path="/knowledge" />
          <Tasks path="/tasks" />
          <Skills path="/skills" />
          <Network path="/network" />
          <Trace path="/trace/:id" />
          <NotFound default />
        </Router>
      </main>
    </div>
  )
}
