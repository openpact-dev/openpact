import { useEffect, useId, useRef, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'

interface Props {
  chart: string
  caption?: string
  class?: string
}

/**
 * Parse a trusted SVG string from mermaid.render() into a DOM node.
 * We intentionally avoid innerHTML so the site stays clear of any
 * template-injection warnings. Chart sources are hard-coded in this
 * repo; mermaid itself runs with `securityLevel: 'strict'`.
 */
function parseSvg(svgString: string): SVGElement | null {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName === 'parsererror') return null
  return root as unknown as SVGElement
}

export function Mermaid({ chart, caption, class: cls = '' }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const lightboxHostRef = useRef<HTMLDivElement | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    let cancelled = false

    const render = async () => {
      try {
        const mod = await import('mermaid')
        const mermaid = mod.default
        const readVar = (name: string, fallback: string) => {
          if (typeof window === 'undefined') return fallback
          const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
          return v || fallback
        }
        const isDark = document.documentElement.classList.contains('dark')
        const ember = readVar('--color-ember', isDark ? '#ef4444' : '#b3331a')
        const paper = readVar('--color-paper', isDark ? '#14100f' : '#fbf8f0')
        const canvas = readVar('--color-canvas', isDark ? '#0e0a09' : '#f3eee2')
        const ink = readVar('--color-ink', isDark ? '#f0e1d8' : '#1c1408')
        const ink2 = readVar('--color-ink2', isDark ? '#c8a89c' : '#5a4828')
        const ink3 = readVar('--color-ink3', isDark ? '#7a5e54' : '#8a7a5c')
        const emberSoft = isDark ? 'rgba(239,68,68,0.14)' : '#f1d6c8'

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
          fontSize: 13,
          theme: 'base',
          themeVariables: {
            background: paper,
            primaryColor: emberSoft,
            primaryTextColor: ink,
            primaryBorderColor: ember,
            secondaryColor: canvas,
            secondaryTextColor: ink2,
            secondaryBorderColor: ink3,
            tertiaryColor: paper,
            tertiaryTextColor: ink2,
            tertiaryBorderColor: ink3,
            lineColor: ember,
            textColor: ink,
            mainBkg: paper,
            clusterBkg: canvas,
            clusterBorder: ink3,
            edgeLabelBackground: paper,
            labelBackgroundColor: paper,
            labelBoxBkgColor: emberSoft,
            labelBoxBorderColor: ember,
            labelTextColor: ink,
            actorBkg: canvas,
            actorBorder: ember,
            actorTextColor: ink,
            actorLineColor: ink3,
            signalColor: ink2,
            signalTextColor: ink,
            noteBkgColor: emberSoft,
            noteTextColor: ink,
            noteBorderColor: ember,
          },
        })
        const { svg } = await mermaid.render(`m-${id}`, chart)
        if (cancelled) return
        const host = ref.current
        const svgNode = parseSvg(svg)
        if (host && svgNode) {
          // Normalize every text element so flowcharts, state diagrams,
          // and sequence diagrams all render at the same size/family.
          // Mermaid's per-diagram defaults otherwise drift apart.
          const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace"
          const FONT_SIZE = '13px'
          svgNode.querySelectorAll('text, tspan').forEach((el) => {
            ;(el as SVGTextElement).style.fontFamily = MONO
            ;(el as SVGTextElement).style.fontSize = FONT_SIZE
          })
          svgNode.querySelectorAll('foreignObject div, foreignObject span').forEach((el) => {
            ;(el as HTMLElement).style.fontFamily = MONO
            ;(el as HTMLElement).style.fontSize = FONT_SIZE
            ;(el as HTMLElement).style.lineHeight = '1.45'
          })

          while (host.firstChild) host.removeChild(host.firstChild)
          host.appendChild(svgNode)
          setErr(null)
          setReady(true)
        } else if (!svgNode) {
          setErr('Failed to parse diagram SVG.')
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message ?? 'Diagram failed to render.')
      }
    }

    render()

    const obs = new MutationObserver(() => render())
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      cancelled = true
      obs.disconnect()
    }
  }, [chart, id])

  /* Clone the rendered SVG into the lightbox and let it fill the
   * explicitly-sized stage. preserveAspectRatio ensures the diagram
   * scales up while keeping proportions. */
  useEffect(() => {
    if (!lightbox) return
    const src = ref.current?.querySelector('svg')
    const target = lightboxHostRef.current
    if (!src || !target) return
    const clone = src.cloneNode(true) as SVGElement
    clone.removeAttribute('width')
    clone.removeAttribute('height')
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    clone.style.width = '100%'
    clone.style.height = '100%'
    clone.style.display = 'block'
    while (target.firstChild) target.removeChild(target.firstChild)
    target.appendChild(clone)
  }, [lightbox])

  /* Escape key closes the lightbox; body scroll is locked while it's
   * open so the page behind doesn't drift. */
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lightbox])

  const openLightbox = () => {
    if (ready && !err) setLightbox(true)
  }

  return (
    <figure class={`my-6 ${cls}`}>
      <div
        role={ready && !err ? 'button' : undefined}
        tabIndex={ready && !err ? 0 : undefined}
        aria-label={ready && !err ? `Enlarge diagram${caption ? `: ${caption}` : ''}` : undefined}
        onClick={openLightbox}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openLightbox()
          }
        }}
        class={`group relative overflow-x-auto border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-4 py-5 transition-colors ${
          ready && !err
            ? 'cursor-zoom-in hover:border-[var(--color-ember)] hover:bg-[var(--color-paper)] focus:outline-none focus-visible:border-[var(--color-ember)]'
            : ''
        }`}
      >
        <div ref={ref} />
        {!ready && !err ? (
          <div class="smallcaps text-[var(--color-ink3)]">Rendering diagram…</div>
        ) : null}
        {err ? <div class="smallcaps text-[var(--color-ember)]">{err}</div> : null}
        {ready && !err ? (
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
        ) : null}
      </div>
      {caption ? (
        <figcaption class="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
          {caption}
        </figcaption>
      ) : null}

      {lightbox && typeof document !== 'undefined'
        ? createPortal(
            <div
              class="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-black/80 p-4 backdrop-blur-sm md:p-8"
              role="dialog"
              aria-modal="true"
              aria-label={caption ?? 'Diagram'}
              onClick={() => setLightbox(false)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox(false)
                }}
                class="absolute right-4 top-4 inline-flex items-center gap-2 border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]"
                aria-label="Close"
              >
                <span aria-hidden="true">✕</span>
                Close (Esc)
              </button>

              <div
                ref={lightboxHostRef}
                class="relative flex items-center justify-center border border-[var(--color-line)] bg-[var(--color-paper)] p-6 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.6)] md:p-10"
                style={{ width: 'min(96vw, 1600px)', height: 'min(86vh, 1000px)' }}
                onClick={(e) => e.stopPropagation()}
              />

              {caption ? (
                <div class="pointer-events-none font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-deckle)]">
                  {caption}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </figure>
  )
}
