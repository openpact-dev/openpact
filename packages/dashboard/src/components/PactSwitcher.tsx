import { useEffect, useRef, useState } from 'preact/hooks'
import { route } from 'preact-router'

interface PactSnapshot {
  alias: string
  pact_id: string
  pact_name: string | null
  is_current: boolean
}

interface Props {
  current: string | null
  pacts: PactSnapshot[]
  onSelect: (alias: string) => void
}

/**
 * Sidebar pact switcher. A compact dropdown that shows the current
 * pact's name and lets the user pick another. Clicking outside closes
 * the menu; the "+ New pact" + "Manage pacts" entries route to the
 * pacts page.
 */
export function PactSwitcher({ current, pacts, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const currentPact = pacts.find((p) => p.alias === current)
  const label = currentPact?.pact_name ?? currentPact?.alias ?? '(no pact)'

  return (
    <div ref={ref} class="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="pact-switcher"
        class="group flex w-full items-center justify-between border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)]/60 px-3 py-2 text-left hover:border-[var(--color-ember)]/40"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div class="min-w-0 flex-1">
          <div class="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink3)]">
            Pact
          </div>
          <div class="truncate font-display text-[14px] leading-tight text-[var(--color-ink)]">
            {label}
          </div>
        </div>
        <span
          class={`ml-2 inline-block transition-transform ${open ? 'rotate-180' : ''} text-[var(--color-ink3)]`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          class="absolute left-0 right-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto border-[0.5px] border-[var(--color-line)] bg-[var(--color-paper)] shadow-xl"
          role="listbox"
        >
          {pacts.length === 0 ? (
            <div class="px-3 py-2 text-[13px] italic text-[var(--color-ink3)]">
              No pacts yet.
            </div>
          ) : (
            pacts.map((p) => (
              <button
                key={p.alias}
                type="button"
                role="option"
                aria-selected={p.alias === current}
                data-testid={`pact-switcher-item-${p.alias}`}
                onClick={() => {
                  setOpen(false)
                  if (p.alias !== current) onSelect(p.alias)
                }}
                class={`flex w-full items-center justify-between gap-3 border-b-[0.5px] border-[var(--color-line)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--color-mist)]/40 ${
                  p.alias === current ? 'bg-[var(--color-ember-soft)]' : ''
                }`}
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate font-display text-[14px] text-[var(--color-ink)]">
                    {p.pact_name ?? <span class="italic text-[var(--color-ink3)]">unnamed</span>}
                  </div>
                  <div class="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
                    {p.alias} · {p.pact_id.slice(0, 8)}…
                  </div>
                </div>
                {p.alias === current ? (
                  <span
                    class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ember)]"
                    aria-hidden="true"
                  >
                    current
                  </span>
                ) : null}
              </button>
            ))
          )}

          <button
            type="button"
            data-testid="pact-switcher-manage"
            onClick={() => {
              setOpen(false)
              route('/pacts')
            }}
            class="flex w-full items-center justify-between border-t-[0.5px] border-[var(--color-line)] px-3 py-2 text-left hover:bg-[var(--color-mist)]/40"
          >
            <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink2)]">
              Manage pacts
            </span>
            <span class="font-mono text-[10px] text-[var(--color-ink3)]">→</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
