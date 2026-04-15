import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { OpenPact } from '@openpact/sdk'
import { pact as defaultPact } from '../lib/client'

export const PactContext = createContext<OpenPact>(defaultPact)

/** Returns the SDK client. Uses the singleton unless wrapped in a context override (tests). */
export function usePact(): OpenPact {
  return useContext(PactContext)
}
