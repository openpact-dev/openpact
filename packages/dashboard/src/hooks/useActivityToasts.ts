import { useEffect, useRef } from 'preact/hooks'
import { toast } from 'sonner'
import { useSse, type SseEvent } from './useSse'
import { usePact } from './usePact'
import { useQuery } from './useQuery'
import { shortHandle } from '../lib/format'

type EntryAppliedData = {
  kind: string
  entry?: {
    type?: string
    agent_id?: string
    display_name?: string | null
    payload?: Record<string, unknown>
  } | null
  alias?: string | null
}

type MemberPresenceData = {
  pact_id?: string
  alias?: string
  member_key?: string
}

const PUBLIC_KINDS = new Set(['knowledge', 'task', 'skill', 'message'])

/**
 * Subscribe to SSE and surface a Sonner toast for activity that wasn't
 * authored by this peer. Plays a soft WebAudio chime per toast — first
 * use unlocks the AudioContext (browsers require a gesture), so the
 * very first event after mount may be silent. That's fine.
 */
export function useActivityToasts(enabled = true): void {
  const pact = usePact()
  const sse = useSse({ enabled })
  // Pactless hosts have no per-pact endpoints; resolve stub values so
  // the hook can mount on /pacts and the PactlessState screen without
  // the SDK throwing "no pactId set".
  const status = useQuery(() => (pact.pactId ? pact.status() : Promise.resolve(null)), {
    key: `toast:status:${pact.pactId}`,
    trigger: sse.last?.seq ?? 0,
  })
  // Peers refetch on every SSE event so member-online/offline toasts
  // can resolve the just-authenticated agent's display_name and
  // remote_key into a friendly name.
  const peers = useQuery(() => (pact.pactId ? pact.peers() : Promise.resolve([] as unknown[])), {
    key: `toast:peers:${pact.pactId}`,
    trigger: sse.last?.seq ?? 0,
  })
  const selfHandle = status.data?.peer_handle ?? null
  const nameByKey = useRef<Map<string, string>>(new Map())
  const peersList = peers.data as
    | Array<{ remote_key?: string; display_name?: string | null; id?: string }>
    | undefined
  if (peersList) {
    const next = new Map<string, string>()
    for (const p of peersList) {
      if (!p.remote_key) continue
      const label =
        (typeof p.display_name === 'string' && p.display_name.trim()) ||
        (p.id ? shortHandle(p.id) : shortHandle(p.remote_key))
      next.set(p.remote_key.toLowerCase(), label)
    }
    nameByKey.current = next
  }

  // We watch sse.last by reference; remember which seq we already toasted
  // so a re-render doesn't replay it.
  const lastSeq = useRef<number>(0)
  const audioRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!enabled) return
    const ev = sse.last
    if (!ev || ev.seq <= lastSeq.current) return
    lastSeq.current = ev.seq

    const built = describe(ev, selfHandle, nameByKey.current)
    if (!built) return

    chime(audioRef)
    toast(built.title, {
      description: built.description,
      duration: 4000,
    })
  }, [sse.last, selfHandle, enabled])
}

function describe(
  ev: SseEvent,
  selfHandle: string | null,
  nameByKey: Map<string, string>,
): { title: string; description?: string } | null {
  if (ev.event === 'entry-applied') {
    const data = ev.data as EntryAppliedData
    const kind = data?.kind
    const entry = data?.entry ?? null
    const author = entry?.agent_id ?? null
    if (selfHandle && author === selfHandle) return null // skip our own writes
    const who = entry?.display_name?.trim() || (author ? shortHandle(author) : 'unknown')
    // admin.addWriter is an implementation detail: the rename message
    // the joiner auto-heals with (prev=null) is the user-facing "joined"
    // signal, labelled with the joiner's actual name. Leaving admin
    // silent avoids two back-to-back toasts for the same admission.
    if (kind === 'admin') return null
    if (!kind || !PUBLIC_KINDS.has(kind)) return null
    // Status messages carry a payload.kind marker so the feed / toast
    // can distinguish them from chatter. `leave` fires on pact-remove,
    // `rename` fires whenever an agent updates their display_name.
    if (kind === 'message') {
      const payloadKind = (entry?.payload as { kind?: string } | undefined)?.kind
      if (payloadKind === 'leave') {
        return { title: `${who} left the pact` }
      }
      if (payloadKind === 'rename') {
        const pl = entry?.payload as { prev?: string | null; next?: string | null } | undefined
        const next = (typeof pl?.next === 'string' && pl.next) || who
        const prev = typeof pl?.prev === 'string' && pl.prev ? pl.prev : null
        // prev=null means the auto-heal is firing for the first time
        // for this agent on their current peer — effectively "just
        // joined the pact" from every other agent's POV. A true rename
        // (prev is set) reports the transition.
        return {
          title: prev ? `${prev} is now known as ${next}` : `${next} joined the pact`,
        }
      }
    }
    const summary = summarise(kind, entry?.payload)
    return {
      title: `${who} added a ${kind}`,
      description: summary ?? undefined,
    }
  }
  // Raw swarm peer-add/peer-remove frames are intentionally silent:
  // they fire on any hyperswarm connection churn, including between
  // unrelated pacts on the same host. member-online/offline below are
  // the accurate presence signal for the current pact.
  if (ev.event === 'member-online' || ev.event === 'member-offline') {
    const data = ev.data as MemberPresenceData
    const key = data.member_key?.toLowerCase()
    if (!key) return null
    const name = nameByKey.get(key)
    // First-time admission: no display_name is indexed yet, so the
    // rename auto-heal that fires moments later will surface "X joined
    // the pact" with the actual name. Swallow the no-name online ping
    // so we don't double-toast with a generic handle.
    if (!name && ev.event === 'member-online') return null
    const label = name ?? shortHandle(key)
    return {
      title: ev.event === 'member-online' ? `${label} came online` : `${label} went offline`,
    }
  }
  return null
}

function summarise(kind: string, payload: Record<string, unknown> | undefined): string | null {
  if (!payload) return null
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = payload[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return null
  }
  if (kind === 'knowledge') return pick('topic', 'title', 'summary', 'content')
  if (kind === 'task') return pick('title', 'summary')
  if (kind === 'skill') return pick('name', 'title', 'summary')
  if (kind === 'message') return pick('subject', 'body')
  return null
}

/**
 * Soft 880Hz sine for ~80ms with a quick exponential decay. Quiet enough
 * to be a peripheral cue, not a notification you'd disable.
 */
function chime(ref: { current: AudioContext | null }): void {
  if (typeof window === 'undefined') return
  try {
    if (!ref.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ref.current = new Ctor()
    }
    const ctx = ref.current
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, t0)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.2)
  } catch {
    // Audio is best-effort — never block the toast on it.
  }
}
