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
import { useTheme } from '../hooks/useTheme'
import { usePact } from '../hooks/usePact'
import { useQuery } from '../hooks/useQuery'

interface NavLink {
  href: string
  label: string
  hint: string
}

const PRIMARY: NavLink[] = [
  { href: '/', label: 'Dashboard', hint: 'I' },
  { href: '/knowledge', label: 'Knowledge', hint: 'II' },
  { href: '/tasks', label: 'Tasks', hint: 'III' },
  { href: '/skills', label: 'Skills', hint: 'IV' },
]

const NETWORK: NavLink[] = [{ href: '/network', label: 'Peers', hint: 'V' }]

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

export function Sidebar() {
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
  const status = useQuery(() => pact.status(), { key: 'sidebar:status' })
  const peerHandle = status.data?.peer_handle ?? null
  const displayName = status.data?.display_name ?? null
  const pactName = status.data?.pact_name ?? null
  const peerCount = status.data?.peers ?? 0

  return (
    <nav class="relative z-10 flex h-full w-[228px] shrink-0 flex-col bg-[var(--color-paper)]/70 backdrop-blur-sm">
      {/* Right-edge hairline with a tiny medallion at brand level.
          Diamond uses an integer-pixel offset so it pixel-snaps onto
          the 1px hairline without fractional-subpixel drift on HiDPI. */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute right-0 top-0 h-full w-px bg-[var(--color-line)]"
      >
        <span
          class="absolute block rotate-45 border border-[var(--color-ember)] bg-[var(--color-paper)]"
          style={{ width: 7, height: 7, left: -3, top: 58 }}
        />
      </div>

      {/* Brand block — product name, plus the current pact's name
          (italic, secondary) if the creator has set one. */}
      <div class="px-5 pb-4 pt-6">
        <div class="flex items-center gap-2.5">
          <WatchingEye size={24} />
          <div class="min-w-0">
            <div class="font-display text-[19px] leading-none tracking-tight text-[var(--color-ink)]">
              OpenPact
            </div>
            {pactName ? (
              <div
                class="mt-1 truncate font-display italic text-[12px] leading-none text-[var(--color-ink2)]"
                title={pactName}
              >
                {pactName}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div class="hairline mx-5 mb-3 opacity-60" />

      <div class="px-2.5">
        {PRIMARY.map((link) => (
          <NavRow key={link.href} link={link} current={path} />
        ))}
      </div>

      <div class="mt-5 px-5">
        <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
          Network
        </span>
      </div>
      <div class="px-2.5">
        {NETWORK.map((link) => (
          <NavRow key={link.href} link={link} current={path} />
        ))}
      </div>

      <div class="mt-auto px-5 py-4">
        <div class="hairline mb-3 opacity-60" />
        <div class="space-y-1.5">
          <div class="flex items-baseline justify-between">
            <span class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
              This peer
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
              {peerCount === 0
                ? 'No peers yet'
                : peerCount === 1
                  ? '1 peer connected'
                  : `${peerCount} peers connected`}
            </span>
          </div>
        </div>
        <div class="mt-4 flex justify-end">
          <ThemeDial />
        </div>
      </div>
    </nav>
  )
}
