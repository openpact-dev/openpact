import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { OpenPact } from '@openpact/sdk'
import { hostClient, clientForPact } from '../lib/client'

/**
 * Per-pact SDK client. The default value is the host-only client (no
 * pactId) so calls into per-pact resources without a context throw a
 * loud error from the SDK rather than silently calling /v1/<...>.
 *
 * The provider in `app.tsx` wraps the tree with a client bound to the
 * current pactId; pages get that via `usePact()`.
 */
export const PactContext = createContext<OpenPact>(hostClient)

/** Returns the SDK client scoped to the current pact. */
export function usePact(): OpenPact {
  return useContext(PactContext)
}

/** Build (or reuse) a client for a specific pact alias. Used by the provider. */
export function pactClient(alias: string): OpenPact {
  return clientForPact(alias)
}

/** Host-only client — for `pacts.*` calls and the host status summary. */
export function hostPact(): OpenPact {
  return hostClient
}
