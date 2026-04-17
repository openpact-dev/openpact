import { Command } from 'commander'
import path from 'path'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { loadSettings, mergeSettings, settingsPath, writeSettings } from '../lib/claude-code'
import { c, emoji } from '../lib/theme'

export interface InstallClaudeCodeOpts {
  dir?: string
  pact?: string
  force?: boolean
  bin?: string
}

/**
 * Register `openpact install <runtime>` and its subcommands on the
 * parent program. Called once from bin.ts. Kept as an attacher so
 * new runtimes (cursor, windsurf, zed) slot in here rather than
 * bloating bin.ts.
 */
export function registerInstallCommand(parent: Command): void {
  const install = parent
    .command('install')
    .description('install OpenPact into an IDE or agent runtime')

  install
    .command('claude-code')
    .description('write SessionStart + UserPromptSubmit hooks into <project>/.claude/settings.json')
    .option('--dir <path>', 'project directory (default: current working directory)')
    .option('--pact <alias>', 'pact to target (default: current pact)')
    .option('--force', 'replace an existing OpenPact-managed hook (e.g. after switching pact)')
    .option('--bin <cmd>', 'openpact command to bake into the hook', 'openpact')
    .action((opts: InstallClaudeCodeOpts, cmd: { optsWithGlobals(): GlobalCliOpts }) =>
      installClaudeCodeCmd(opts, cmd),
    )
}

export async function installClaudeCodeCmd(
  opts: InstallClaudeCodeOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  const projectDir = path.resolve(opts.dir ?? process.cwd())
  const alias = await resolveCurrentPact(hostDir, opts.pact)
  const file = settingsPath(projectDir)
  const binCmd = opts.bin ?? 'openpact'

  const existing = await loadSettings(file)
  const { settings, changes, skippedExisting } = mergeSettings(existing, {
    alias,
    binCmd,
    force: opts.force,
  })

  if (changes.length === 0) {
    console.log(`  ${emoji.brand} ${c.ash('Hooks already up to date at')} ${c.bone(file)}`)
    return
  }

  if (skippedExisting && !opts.force) {
    // Print the plan, don't write.
    console.error(`${emoji.cross} ${c.brand('Existing OpenPact hooks found at')} ${c.bone(file)}`)
    for (const line of changes) console.error(`  ${c.ash('·')} ${line}`)
    console.error(`  ${c.ash('Re-run with --force to replace.')}`)
    process.exit(1)
  }

  await writeSettings(file, settings)
  console.log(
    `  ${emoji.brand} ${c.brandBold('Sealed')} ${c.bone('Claude Code hooks')} ${c.ash('for pact')} ${c.bone(alias)}`,
  )
  console.log(`  ${c.ash(file)}`)
  for (const line of changes) console.log(`  ${c.ash('·')} ${line}`)
  console.log('')
  console.log(`  ${c.ash('Open this project in Claude Code; hooks fire on your next session.')}`)
  console.log(`  ${c.ash('Prompt-submit will be silent until another agent posts activity.')}`)
}
