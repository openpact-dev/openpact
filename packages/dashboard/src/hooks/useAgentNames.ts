import { useMemo } from 'preact/hooks'
import { usePact } from './usePact'
import { useQuery } from './useQuery'
import { useSharedSse } from './useSse'
import { eventSeqForPact } from '../lib/events'
import { shortHandle } from '../lib/format'

/**
 * Lookup helper that resolves canonical peer handles (`anon-*`) to the
 * display name each agent chose. Fields like `task.claimed_by`,
 * `task.assigned_to`, and the handles inside admin dialogs arrive as
 * bare strings — there's no `display_name` alongside them the way there
 * is on entries — so the UI needs a side-channel to hydrate them into
 * human names.
 *
 * Backs the lookup with `pact.agents()`, which returns every admitted
 * member of the current pact (self plus remotes). Refetches on the
 * usual event triggers so a rename propagates without a manual reload.
 *
 * Fallback when a handle isn't in the roster (e.g. a historical entry
 * from a member who's since been removed): `shortHandle(handle)`.
 */
export function useAgentNames() {
  const pact = usePact()
  const sse = useSharedSse()
  const trigger = eventSeqForPact(sse.last, pact.pactId, [
    'entry-applied',
    'update',
    'member-online',
  ])

  const agents = useQuery(() => pact.agents(), {
    key: `agent-names:${pact.pactId}`,
    trigger,
  })

  const nameByHandle = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of agents.data ?? []) {
      const handle = (a as { id?: string }).id
      const name = (a as { display_name?: string | null }).display_name
      if (handle && typeof name === 'string' && name.trim() !== '') {
        m.set(handle, name)
      }
    }
    return m
  }, [agents.data])

  return useMemo(
    () => ({
      /** Display name for a handle; falls back to a shortened handle. */
      nameFor(handle: string | null | undefined): string {
        if (!handle) return ''
        const hit = nameByHandle.get(handle)
        if (hit) return hit
        return shortHandle(handle)
      },
      /**
       * True when a name is known for the handle. Lets callers render
       * differently when they only have the opaque handle to show.
       */
      hasName(handle: string | null | undefined): boolean {
        return !!handle && nameByHandle.has(handle)
      },
    }),
    [nameByHandle],
  )
}
