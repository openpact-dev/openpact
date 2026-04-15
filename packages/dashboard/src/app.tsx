import { Router } from 'preact-router'
import { Dashboard } from './pages/Dashboard'
import { Knowledge } from './pages/Knowledge'

function Stub({ name }: { name: string }) {
  return (
    <section class="page page-stub">
      <h1 class="page-title">{name}</h1>
      <p class="empty-state">this screen lands in slice D.</p>
    </section>
  )
}

function NotFound() {
  return (
    <section class="page">
      <h1 class="page-title">not found</h1>
      <p class="empty-state">the route you asked for doesn't exist (yet).</p>
    </section>
  )
}

function Sidebar() {
  return (
    <nav class="sidebar" aria-label="Primary">
      <div class="sidebar-brand">
        <span class="brand-mark" aria-hidden="true">
          🜏
        </span>
        <span class="brand-name">OpenPact</span>
      </div>
      <ul class="nav-list">
        <li>
          <a href="/" data-testid="nav-dashboard">
            Dashboard
          </a>
        </li>
        <li>
          <a href="/knowledge" data-testid="nav-knowledge">
            Knowledge
          </a>
        </li>
        <li>
          <a href="/tasks" data-testid="nav-tasks">
            Tasks
          </a>
        </li>
        <li>
          <a href="/skills" data-testid="nav-skills">
            Skills
          </a>
        </li>
        <li>
          <a href="/network" data-testid="nav-network">
            Network
          </a>
        </li>
      </ul>
    </nav>
  )
}

export function App() {
  return (
    <div class="layout">
      <Sidebar />
      <main class="content">
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
