import { Command } from 'commander'
import {
  OpenPact,
  DaemonNotRunningError,
  NotCreatorError,
  NotConfirmedError,
  NotFoundError,
  SkillChecksumMismatchError,
} from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact, NoPactsError } from '../lib/pact-select'
import { askText } from '../lib/prompt'
import { c, emoji } from '../lib/theme'

interface InstallOpts {
  pact?: string
  port?: string | number
  yes?: boolean
  interactive?: boolean
}

export function registerSkillCommand(parent: Command): void {
  const skill = parent.command('skill').description('manage skills within the current pact')

  skill
    .command('install <id>')
    .description(
      'install a skill (creator only; downloads content, verifies checksum, writes to disk)',
    )
    .option('--yes', 'skip the typed confirmation prompt (required in CI)')
    .option('--no-interactive', 'skip prompts')
    .option('--pact <alias>', 'pact to install into (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action((id: string, opts: InstallOpts, cmd: { optsWithGlobals(): GlobalCliOpts }) =>
      skillInstall(id, opts, cmd),
    )
}

async function skillInstall(
  id: string,
  opts: InstallOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  let pactId: string
  try {
    pactId = await resolveCurrentPact(hostDir, opts.pact)
  } catch (err) {
    if (err instanceof NoPactsError) {
      console.error(`${emoji.cross} ${c.brand(err.message)}`)
      process.exit(1)
    }
    throw err
  }
  const client = new OpenPact({ port: Number(opts.port ?? 7666), pactId, hostDir })

  // Fetch content first so we can show the user what they're about to install.
  let preview: { name: string; version: string; format: string } | null = null
  try {
    const content = await client.skills.getContent(id)
    preview = { name: content.name, version: content.version, format: content.format }
    console.log(
      `  ${emoji.brand} ${c.brandBold('Skill')} ${c.bone(`${content.name}@${content.version}`)} ${c.ash(`(${content.format})`)}`,
    )
    console.log(`  ${c.ash(`id ${content.id} · checksum verified`)}`)
  } catch (err) {
    if (err instanceof NotFoundError) {
      console.error(`${emoji.cross} ${c.brand(`No skill with id ${id}.`)}`)
      process.exit(1)
    }
    if (err instanceof SkillChecksumMismatchError) {
      console.error(
        `${emoji.cross} ${c.brand('Skill content checksum does not match entry. Refusing.')}`,
      )
      process.exit(1)
    }
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
      process.exit(1)
    }
    throw err
  }

  const nonInteractive = opts.interactive === false || !!opts.yes
  if (!opts.yes) {
    const typed = await askText({
      nonInteractive,
      default: '',
      label: `Type "install" to confirm`,
      max: 16,
    })
    if (typed !== 'install') {
      throw new Error(
        nonInteractive
          ? `refusing to install ${id} without --yes`
          : `confirmation mismatch — expected "install", got "${typed}". aborted.`,
      )
    }
  }

  try {
    const res = await client.skills.install(id)
    console.log(`  ${emoji.brand} ${c.brandBold('Installed')} ${c.bone(preview?.name ?? id)}`)
    console.log(`  ${c.ash(res.path)}`)
    console.log(`  ${c.ash(res.installed_at)}`)
  } catch (err) {
    if (err instanceof NotCreatorError) {
      console.error(`${emoji.cross} ${c.brand('Only the pact creator can install skills.')}`)
      process.exit(1)
    }
    if (err instanceof NotConfirmedError) {
      console.error(
        `${emoji.cross} ${c.brand('Install requires typed confirmation (use --yes in CI).')}`,
      )
      process.exit(1)
    }
    if (err instanceof SkillChecksumMismatchError) {
      console.error(
        `${emoji.cross} ${c.brand('Skill content checksum mismatch at install time. Refusing.')}`,
      )
      process.exit(1)
    }
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
      process.exit(1)
    }
    throw err
  }
}
