/**
 * The codex spine.
 *
 * Sidebar with the watching-eye logo at the top, ledger-style nav
 * with Roman numerals as right-margin folios, and a small brass dial
 * for the theme preference at the foot.
 */
import { useEffect, useState } from 'preact/hooks'
import { ThemeDial } from './ThemeDial'
import { WatchingEye } from './Ornament'
import { PactSwitcher } from './PactSwitcher'
import { useTheme } from '../hooks/useTheme'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'
import { useSse } from '../hooks/useSse'

const DOCS_URL = 'https://openpact.dev/docs/overview/'
const GITHUB_URL = 'https://github.com/openpact-dev/openpact'

interface PactSnapshot {
  alias: string
  pact_id: string
  pact_name: string | null
  is_current: boolean
}

export interface SidebarProps {
  /** Currently-selected pact alias (from useCurrentPact at the App root). */
  current: string | null
  /** Every pact known to this host. */
  pacts: PactSnapshot[]
  /** Switch to a different pact. */
  onSelect: (alias: string) => void
}

interface NavLink {
  href: string
  label: string
  hint: string
}

const PRIMARY: NavLink[] = [
  { href: '/', label: 'Dashboard', hint: 'I' },
  { href: '/knowledge', label: 'Knowledge', hint: 'II' },
  { href: '/tasks', label: 'Tasks', hint: 'III' },
  { href: '/messages', label: 'Messages', hint: 'IV' },
  { href: '/skills', label: 'Skills', hint: 'V' },
]

const NETWORK: NavLink[] = [{ href: '/network', label: 'Network', hint: 'VI' }]

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/'
  return currentPath.startsWith(href)
}

function NavRow({ link, current }: { link: NavLink; current: string }) {
  const active = isActive(current, link.href)
  return (
    <a
      href={link.href}
      class={`group relative flex items-center justify-between border-l-2 px-3 py-1.5 transition-colors ${
        active
          ? 'border-l-[var(--color-ember)] text-[var(--color-ink)]'
          : 'border-l-transparent text-[var(--color-ink2)] hover:text-[var(--color-ink)]'
      }`}
      data-testid={`nav-${link.label.toLowerCase()}`}
    >
      <span class="text-[14px] font-medium leading-none">
        <span class="ember-underline">{link.label}</span>
      </span>
      <span class="font-mono text-[10px] tracking-wider text-[var(--color-ink3)]">{link.hint}</span>
    </a>
  )
}

export function Sidebar({ current, pacts, onSelect }: SidebarProps) {
  useTheme() // re-render when the resolved theme changes

  const [path, setPath] = useState<string>(
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handler)
    const orig = window.history.pushState
    window.history.pushState = function (...args: Parameters<typeof orig>) {
      orig.apply(window.history, args)
      handler()
    }
    return () => {
      window.removeEventListener('popstate', handler)
      window.history.pushState = orig
    }
  }, [])

  const pact = usePact()
  const sse = useSse()
  const trigger = sse.last?.seq ?? 0
  // Per-pact status — keyed by current alias so the cache invalidates
  // on switch and re-fetches against the new pact.
  const status = useQuery(() => pact.status(), {
    key: `sidebar:status:${current ?? 'none'}`,
    trigger,
  })
  // Pact-scoped writer list. We count self + remote writers so the
  // sidebar reports "agents in this pact" rather than raw swarm
  // connections (daemon.connections is host-wide and includes peers
  // not yet admitted to the current pact).
  const peers = useQuery(() => pact.peers(), {
    key: `sidebar:peers:${current ?? 'none'}`,
    trigger,
  })
  const peerHandle = status.data?.peer_handle ?? null
  const displayName = status.data?.display_name ?? null
  const pactName = status.data?.pact_name ?? null
  const agentCount = (Array.isArray(peers.data) ? peers.data.length : 0) + (status.data ? 1 : 0)
  // Reflect the active pact name in the browser tab so multiple
  // dashboards open against different pacts are distinguishable.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = pactName ? `${pactName} — OpenPact` : 'OpenPact'
  }, [pactName])

  return (
    <nav class="relative z-10 flex h-full w-[228px] shrink-0 flex-col bg-[var(--color-paper)]/70 backdrop-blur-sm">
      {/* Right-edge hairline. */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute right-0 top-0 h-full w-px bg-[var(--color-line)]"
      />

      {/* Brand block — product name, plus the current pact's name
          (italic, secondary) when status has loaded. */}
      <div class="px-5 pb-4 pt-6">
        <div class="flex items-center gap-2.5">
          <WatchingEye size={24} />
          <div class="min-w-0">
            <div class="font-display text-[19px] leading-none tracking-tight text-[var(--color-ink)]">
              OpenPact
            </div>
            {/* Subtitle always renders — pactless slot keeps the brand
                block at a fixed height so the hairline under it aligns
                with the one in PactSwitcher's border. */}
            <div
              class="mt-1 truncate font-display italic text-[12px] leading-none text-[var(--color-ink2)]"
              title={pactName ?? 'No pact selected'}
            >
              {pactName ?? <span class="text-[var(--color-ink3)]">Pactless</span>}
            </div>
          </div>
        </div>
      </div>

      <div class="hairline mx-5 mb-3 opacity-60" />

      {/* Pact switcher sits above the nav so it's always reachable. */}
      <div class="mb-4 px-3">
        <PactSwitcher current={current} pacts={pacts} onSelect={onSelect} />
      </div>

      <div class="px-2.5">
        {PRIMARY.map((link) => (
          <NavRow key={link.href} link={link} current={path} />
        ))}
        {NETWORK.map((link) => (
          <NavRow key={link.href} link={link} current={path} />
        ))}
      </div>

      <div class="mt-auto px-5 py-4">
        <div class="hairline mb-3 opacity-60" />
        <div class="space-y-1.5">
          <div class="flex items-baseline justify-between">
            <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              Your agent
            </span>
            <span
              class="truncate font-mono text-[10px] text-[var(--color-ink2)]"
              title={peerHandle ?? undefined}
            >
              {displayName || (peerHandle ? peerHandle.split('-').slice(1).join('-') : '…')}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="relative inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-online)]"
              aria-hidden="true"
            >
              <span class="absolute inset-0 animate-ember-pulse rounded-full" />
            </span>
            <span class="text-[13px] text-[var(--color-ink2)]">
              {agentCount === 0
                ? 'No pact selected'
                : agentCount === 1
                  ? 'Just you'
                  : `${agentCount} agents`}
            </span>
          </div>
        </div>

        <div class="hairline mt-4 opacity-60" />
        <div class="mt-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="sidebar-docs-link"
              class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)] hover:text-[var(--color-ember)]"
            >
              Docs ↗
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="sidebar-github-link"
              class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)] hover:text-[var(--color-ember)]"
            >
              GitHub ↗
            </a>
          </div>
          <ThemeDial />
        </div>
      </div>
    </nav>
  )
}
