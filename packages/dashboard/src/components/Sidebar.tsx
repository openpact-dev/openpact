/**
 * 220-px sidebar with the OpenPact logo, primary nav (Dashboard /
 * Knowledge / Tasks / Skills), Network section (Peers / Invite),
 * System section (Settings), and a "peers connected" footer.
 *
 * Visual matches docs/mockups/01-dashboard.html. Active state is
 * derived from window.location.pathname so navigation works without a
 * shared context (preact-router updates URL in place).
 */
import { useEffect, useState } from 'preact/hooks'

interface NavLink {
  href: string
  label: string
  icon: preact.JSX.Element
}

const PRIMARY: NavLink[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2" />
      </svg>
    ),
  },
  {
    href: '/knowledge',
    label: 'Knowledge',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.2" />
        <path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M2 4h12M2 8h8M2 12h10"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
      </svg>
    ),
  },
  {
    href: '/skills',
    label: 'Skills',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M4 2l8 6-8 6V2z"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      </svg>
    ),
  },
]

const NETWORK: NavLink[] = [
  {
    href: '/network',
    label: 'Peers',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="4" r="2" stroke="currentColor" stroke-width="1.2" />
        <circle cx="3" cy="12" r="2" stroke="currentColor" stroke-width="1.2" />
        <circle cx="13" cy="12" r="2" stroke="currentColor" stroke-width="1.2" />
        <path
          d="M8 6v2M6.5 9.5L5 10.5M9.5 9.5L11 10.5"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
      </svg>
    ),
  },
]

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/'
  return currentPath.startsWith(href)
}

function NavRow({ link, current }: { link: NavLink; current: string }) {
  const active = isActive(current, link.href)
  const base =
    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] no-underline transition-colors'
  const tone = active
    ? 'bg-canvas font-medium text-ink'
    : 'text-ink2 hover:bg-canvas hover:text-ink'
  return (
    <a href={link.href} class={`${base} ${tone}`} data-testid={`nav-${link.label.toLowerCase()}`}>
      <span
        class={`inline-flex h-[15px] w-[15px] items-center justify-center ${active ? 'opacity-80' : 'opacity-50'}`}
      >
        {link.icon}
      </span>
      {link.label}
    </a>
  )
}

export function Sidebar() {
  const [path, setPath] = useState<string>(
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handler)
    // preact-router fires `pushState` events on Link/route navigations;
    // listen on the window to catch them.
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

  return (
    <nav class="flex w-[220px] shrink-0 flex-col gap-0.5 border-r-[0.5px] border-line bg-paper px-3 py-4">
      <div class="mb-4 flex items-center gap-2.5 px-2.5 py-2">
        <img src="/openpact-logo.svg" alt="" class="h-8 w-8" />
        <span class="text-[15px] font-semibold tracking-tight">OpenPact</span>
      </div>

      {PRIMARY.map((link) => (
        <NavRow key={link.href} link={link} current={path} />
      ))}

      <div class="px-2.5 pb-1 pt-4 text-[10px] font-medium uppercase tracking-[0.08em] text-ink3">
        Network
      </div>
      {NETWORK.map((link) => (
        <NavRow key={link.href} link={link} current={path} />
      ))}

      <div class="mt-auto border-t-[0.5px] border-line p-2.5">
        <div class="flex items-center gap-1.5 text-xs text-ink2">
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-[#1d9e75]" />
          <span>connected</span>
        </div>
      </div>
    </nav>
  )
}
