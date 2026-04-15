/** Relative-time formatter for the activity feed. */
export function relTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso
  const sec = Math.max(0, Math.floor((now - then) / 1000))
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

/** Trim a peer handle / pact id for compact display. */
export function shortHandle(handle: string | null | undefined): string {
  if (!handle) return ''
  if (handle.length <= 20) return handle
  return handle.slice(0, 12) + '…'
}
