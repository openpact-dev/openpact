import { useEffect, useId, useRef, useState } from 'preact/hooks'

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
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
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

  return (
    <figure class={`my-6 ${cls}`}>
      <div class="overflow-x-auto border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-4 py-5">
        <div ref={ref} />
        {!ready && !err ? (
          <div class="smallcaps text-[var(--color-ink3)]">Rendering diagram…</div>
        ) : null}
        {err ? <div class="smallcaps text-[var(--color-ember)]">{err}</div> : null}
      </div>
      {caption ? (
        <figcaption class="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink3)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}
