import { config as daemonConfig } from '@openpact/daemon'

/**
 * Thrown by {@link resolveCurrentPact} when the host has no pacts.
 * Commands that can surface an empty state themselves (like `op log`)
 * catch this and render a welcoming banner; everything else lets it
 * bubble to bin.ts's top-level handler so the user sees the message.
 */
export class NoPactsError extends Error {
  constructor(hostDir: string) {
    super(`no pacts at ${hostDir}. run \`openpact init\` or \`openpact join <token>\` first.`)
    this.name = 'NoPactsError'
  }
}

/**
 * Resolve the pact alias a CLI command should target. Precedence:
 *   1. explicit --pact <alias> flag
 *   2. env var OPENPACT_PACT
 *   3. daemon.json.currentAlias
 *   4. first pact in the registry (if any)
 *   5. throw NoPactsError (empty registry)
 *
 * Previously fell back to the literal alias "default", which produced
 * a confusing 404 UNKNOWN_PACT against an empty registry. The typed
 * error here lets callers render a friendly empty state instead.
 *
 * When a flag or env value is provided we trust it as-is — the REST
 * call will 404 if it doesn't exist, and that's the user's signal to
 * fix the argument.
 */
export async function resolveCurrentPact(
  hostDir: string,
  flagValue: string | undefined,
): Promise<string> {
  if (flagValue && flagValue.trim() !== '') return flagValue
  const envValue = process.env.OPENPACT_PACT
  if (envValue && envValue.trim() !== '') return envValue
  const registry = await daemonConfig.loadDaemonConfig(hostDir).catch(() => null)
  if (!registry || registry.pacts.length === 0) throw new NoPactsError(hostDir)
  return registry.currentAlias ?? registry.pacts[0].alias
}
