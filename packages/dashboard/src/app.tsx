import { Router } from 'preact-router'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Knowledge } from './pages/Knowledge'

function Stub({ name }: { name: string }) {
  return (
    <section class="p-6">
      <h1 class="text-xl font-semibold tracking-tight text-ink">{name}</h1>
      <p class="mt-4 text-sm italic text-ink3">This screen lands in slice D.</p>
    </section>
  )
}

function NotFound() {
  return (
    <section class="p-6">
      <h1 class="text-xl font-semibold tracking-tight text-ink">Not found</h1>
      <p class="mt-4 text-sm italic text-ink3">The route you asked for doesn't exist (yet).</p>
    </section>
  )
}

export function App() {
  return (
    <div class="flex min-h-screen">
      <Sidebar />
      <main class="flex-1 overflow-y-auto px-7 py-6">
        <Router>
          <Dashboard path="/" />
          <Knowledge path="/knowledge" />
          <Stub path="/tasks" name="Tasks" />
          <Stub path="/skills" name="Skills" />
          <Stub path="/network" name="Network" />
          <Stub path="/trace/:id" name="Trace" />
          <NotFound default />
        </Router>
      </main>
    </div>
  )
}
