import { useState } from 'preact/hooks'

interface Props {
  value: string
  label?: string
  class?: string
}

/**
 * A small icon-only copy button. On click, writes `value` to the
 * clipboard and briefly swaps the clipboard glyph for a checkmark.
 */
export function CopyButton({ value, label = 'Copy', class: cls = '' }: Props) {
  const [copied, setCopied] = useState(false)

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked; no-op */
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      class={`inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-[var(--color-ink3)] transition-colors hover:bg-[var(--color-ember)]/10 hover:text-[var(--color-ember)] focus-visible:text-[var(--color-ember)] ${cls}`}
      aria-label={copied ? 'Copied to clipboard' : `${label} to clipboard`}
      title={copied ? 'Copied' : label}
    >
      {copied ? <CheckIcon /> : <ClipboardIcon />}
    </button>
  )
}

function ClipboardIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.1"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="8" height="10" rx="1" />
      <path d="M5 3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
      <path d="M5 3h4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      style={{ color: 'var(--color-ember)' }}
    >
      <path d="M2.5 7.5 6 11l5.5-8" />
    </svg>
  )
}
