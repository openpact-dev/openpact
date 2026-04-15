import { config as daemonConfig } from '@openpact/daemon'

/**
 * Resolve the pact alias a CLI command should target. Precedence:
 *   1. explicit --pact <alias> flag
 *   2. env var OPENPACT_PACT
 *   3. daemon.json.currentAlias
 *   4. fallback "default"
 *
 * Does not validate the alias against the registry — the API call
 * that follows returns 404 UNKNOWN_PACT if it's unknown.
 */
export async function resolveCurrentPact(
  hostDir: string,
  flagValue: string | undefined,
): Promise<string> {
  if (flagValue && flagValue.trim() !== '') return flagValue
  const envValue = process.env.OPENPACT_PACT
  if (envValue && envValue.trim() !== '') return envValue
  const registry = await daemonConfig.loadDaemonConfig(hostDir).catch(() => null)
  return registry?.currentAlias ?? 'default'
}
