import { Command } from 'commander'
import { c, emoji, banner } from './lib/theme'
import { initCmd } from './commands/init'
import { joinCmd } from './commands/join'
import { inviteCmd } from './commands/invite'
import { startCmd } from './commands/start'
import { startForegroundCmd } from './commands/start-foreground'
import { stopCmd } from './commands/stop'
import { statusCmd } from './commands/status'
import { peersCmd } from './commands/peers'
import { logCmd } from './commands/log'
import { addWriterCmd } from './commands/add-writer'
import { removeWriterCmd } from './commands/remove-writer'
import { dashboardCmd } from './commands/dashboard'

export function buildProgram(): Command {
  const program = new Command()
    .name('openpact')
    .description(
      `${emoji.brand} OpenPact. A pact among daemons. P2P shared memory for software agents.`,
    )
    .version('0.0.0')
    .option('--data-dir <path>', 'override data directory (default: ~/.openpact)')
    .enablePositionalOptions()
    .showHelpAfterError()

  // Banner on top-level help only — not on subcommand help (would be noisy
  // on every `openpact <verb> --help`).
  program.addHelpText('before', banner())

  program
    .command('init')
    .description('seal a new pact; auto-starts the daemon when run from a TTY')
    .option('--force', 'break the existing pact and seal a fresh one')
    .option('--name <str>', 'pact name (e.g. "The Obsidian Accord")')
    .option('--purpose <str>', 'one-line purpose statement for the pact')
    .option('--display-name <str>', 'your display name (advisory; peer handle stays canonical)')
    .option('--no-interactive', 'skip prompts (use defaults or flags only; for CI / pipes)')
    .option('--no-start', "don't auto-start the daemon after init")
    .option('--no-open', "don't open the dashboard in the default browser")
    .option('--port <n>', 'REST API port (forwarded to auto-start)', '7666')
    .option('--dashboard-port <n>', 'dashboard port (forwarded to auto-start)', '7667')
    .action(initCmd)

  program
    .command('join <key>')
    .description('enter an existing pact using its hex key')
    .option('--force', 'break the existing pact and join the new one')
    .option('--display-name <str>', 'your display name (advisory; peer handle stays canonical)')
    .option('--no-interactive', 'skip prompts (use defaults or flags only; for CI / pipes)')
    .action(joinCmd)

  program
    .command('invite')
    .description('print the pact key (share to invite a peer)')
    .action(inviteCmd)

  program
    .command('start')
    .description('summon the daemon in the background (REST API on :7666; dashboard on :7667)')
    .option('--foreground', 'run in the foreground (do not detach)')
    .option('--port <n>', 'REST API port', '7666')
    .option(
      '--bootstrap <list>',
      'comma-separated host:port DHT bootstrap (advanced; default: public DHT)',
    )
    .option('--no-dashboard', 'skip the dashboard (headless / seed nodes / CI)')
    .option('--dashboard-port <n>', 'dashboard port (default 7667; 0 = OS-chosen)')
    .action(startCmd)

  program
    .command('start-foreground', { hidden: true })
    .option('--port <n>', '', '7666')
    .option('--bootstrap <list>', '')
    .option('--no-dashboard', '')
    .option('--dashboard-port <n>', '')
    .action(startForegroundCmd)

  program
    .command('dashboard')
    .description('open the OpenPact dashboard in the default browser')
    .option('--port <n>', 'dashboard port', '7667')
    .action(dashboardCmd)

  program
    .command('stop')
    .description('banish the daemon')
    .option('--timeout <ms>', 'graceful shutdown timeout', '5000')
    .action(stopCmd)

  program
    .command('status')
    .description('show pact status')
    .option('--port <n>', '', '7666')
    .action(statusCmd)

  program
    .command('peers')
    .description('list peers bound to the pact')
    .option('--port <n>', '', '7666')
    .action(peersCmd)

  program
    .command('add-writer <key>')
    .description('bind a peer (by hex public key) as a writer or indexer')
    .option('--indexer', 'bind as indexer (participates in consensus)')
    .option('--port <n>', '', '7666')
    .action(addWriterCmd)

  program
    .command('remove-writer <key>')
    .description('sever a peer from the writer set')
    .option('--port <n>', '', '7666')
    .action(removeWriterCmd)

  program
    .command('log')
    .description('print recent entries from the pact')
    .option('--type <t>', 'filter by entry type (knowledge|task|skill|message)')
    .option('--limit <n>', 'maximum entries to print', '20')
    .option('--port <n>', '', '7666')
    .action(logCmd)

  return program
}

export async function run(argv = process.argv): Promise<void> {
  const program = buildProgram()
  await program.parseAsync(argv)
}

// Direct invocation guard: only run when executed (not when imported in tests).
if (require.main === module || (process.argv[1] && process.argv[1].endsWith('openpact.js'))) {
  run().catch((err) => {
    console.error(`${emoji.cross} ${c.brand((err as Error).message)}`)
    process.exit(1)
  })
}
