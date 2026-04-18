import { useEffect, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import type { JSX } from 'preact'

interface Props {
  /** Path to the light-mode image. */
  light: string
  /** Path to the dark-mode image. Same intrinsic dimensions as `light`. */
  dark: string
  /** Alt text for the inline image. Also the lightbox dialog label. */
  alt: string
  /** Extra classes on the inline <img>. Ignored in the lightbox. */
  class?: string
  /** Native width/height for CLS. */
  width?: number | string
  height?: number | string
  /** eager for above-the-fold. Defaults to lazy. */
  loading?: JSX.HTMLAttributes<HTMLImageElement>['loading']
}

/**
 * Clickable ThemedImage: swaps between a light and dark source based
 * on the site's `.dark` class, and opens a full-viewport lightbox on
 * click or Enter/Space. Escape or a click on the backdrop closes it.
 * Body scroll is locked while the lightbox is open.
 *
 * Hydration: the inline <button> wrapper stays a real interactive
 * element in the prerendered HTML (no JS required to read the page),
 * and the onClick handler attaches on client hydration.
 */
export function LightboxImage({
  light,
  dark,
  alt,
  class: className = '',
  width,
  height,
  loading = 'lazy',
}: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  const baseCls = `block dark:hidden ${className}`.trim()
  const invCls = `hidden dark:block ${className}`.trim()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        class="group relative block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
        aria-label={`Enlarge: ${alt}`}
      >
        <img
          src={light}
          alt={alt}
          class={baseCls}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
        />
        <img
          src={dark}
          alt=""
          aria-hidden="true"
          class={invCls}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
        />
        <span
          aria-hidden="true"
          class="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1.5 border border-[var(--color-line)] bg-[var(--color-paper)]/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink3)] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <svg
            viewBox="0 0 16 16"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 6V2h4" />
            <path d="M14 6V2h-4" />
            <path d="M2 10v4h4" />
            <path d="M14 10v4h-4" />
          </svg>
          Click to expand
        </span>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              class="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-black/80 p-4 backdrop-blur-sm md:p-8"
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              onClick={() => setOpen(false)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                }}
                class="absolute right-4 top-4 inline-flex items-center gap-2 border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
                aria-label="Close"
              >
                <span aria-hidden="true">✕</span>
                Close (Esc)
              </button>

              <div
                class="relative flex items-center justify-center border border-[var(--color-line)] bg-[var(--color-paper)] p-2 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.6)] md:p-3"
                style={{
                  width: 'min(96vw, 1600px)',
                  maxHeight: 'min(90vh, 900px)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={light}
                  alt={alt}
                  class="block h-auto w-full object-contain dark:hidden"
                  style={{ maxHeight: 'calc(min(90vh, 900px) - 1.5rem)' }}
                />
                <img
                  src={dark}
                  alt=""
                  aria-hidden="true"
                  class="hidden h-auto w-full object-contain dark:block"
                  style={{ maxHeight: 'calc(min(90vh, 900px) - 1.5rem)' }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
