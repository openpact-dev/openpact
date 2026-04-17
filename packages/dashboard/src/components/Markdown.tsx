import { useMemo } from 'preact/hooks'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Markdown renderer for agent-authored content.
 *
 * Parses with `marked` (GFM-flavoured) then runs the output through
 * DOMPurify before it hits the DOM. Agents are the primary authors of
 * knowledge and skill content, and anything a peer appended to the
 * pact is echoed verbatim — sanitising is a hard requirement, not a
 * nicety. We only feed DOMPurify-sanitised HTML to the renderer; the
 * raw `marked` output never touches the DOM unscrubbed.
 */

// Links open in a new tab with `noopener noreferrer` so a markdown
// link from a peer can't script the dashboard or grab window.opener.
// Hook into marked's renderer rather than doing a regex swap after
// DOMPurify so we don't lose attributes to the sanitiser's default
// scrub of `target` on anchors.
const renderer = new marked.Renderer()
const originalLink = renderer.link.bind(renderer)
renderer.link = function link(token) {
  const html = originalLink(token)
  return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ')
}

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer,
})

// DOMPurify needs to keep the attributes we add on links. Everything
// else follows its default safe list (no <script>, no inline event
// handlers, no <iframe>).
const SANITIZE_OPTS = {
  ADD_ATTR: ['target', 'rel'],
} as const

export interface MarkdownProps {
  /** Markdown source. Treated as untrusted input and sanitised before render. */
  text: string
  /**
   * Unwrap the surrounding paragraph so the rendered output flows
   * inline with surrounding text. Useful in compact rows (feed
   * summaries, message cards) where a full <p> adds unwanted spacing.
   */
  inline?: boolean
  /** Additional classes on the wrapper (e.g. prose-style utilities). */
  class?: string
}

/**
 * Sanitise + render markdown text. Always runs through DOMPurify; the
 * `dangerouslySetInnerHTML` below only receives HTML that has already
 * been scrubbed of scripts, inline handlers, and unknown tags.
 */
export function Markdown({ text, inline, class: className }: MarkdownProps) {
  const html = useMemo(() => {
    const raw = typeof text === 'string' ? text : ''
    const parsed = inline
      ? marked.parseInline(raw, { async: false })
      : marked.parse(raw, { async: false })
    return DOMPurify.sanitize(parsed as string, SANITIZE_OPTS)
  }, [text, inline])

  const base = inline
    ? `openpact-md openpact-md--inline ${className ?? ''}`
    : `openpact-md ${className ?? ''}`

  // Safe: `html` is always the output of DOMPurify.sanitize(...) above.
  // Same strategy the dashboard already uses for rendered help text.
  if (inline) {
    return <span class={base} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <div class={base} dangerouslySetInnerHTML={{ __html: html }} />
}
