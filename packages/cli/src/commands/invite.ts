import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'

export async function inviteCmd(
  _opts: unknown,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const cfg = await daemonConfig.loadConfig(dir)
  if (!cfg.pactKey) {
    throw new Error(`no pact at ${dir} — run \`openpact init\` first`)
  }
  // Just the key, one line, no decoration. Easy to pipe / copy.
  process.stdout.write(cfg.pactKey + '\n')
}
