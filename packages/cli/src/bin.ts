import { Command } from 'commander'
import pc from 'picocolors'
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

export function buildProgram(): Command {
  const program = new Command()
    .name('openpact')
    .description('P2P shared memory for software agents')
    .version('0.0.0')
    .option('--data-dir <path>', 'override data directory (default: ~/.openpact)')
    .enablePositionalOptions()
    .showHelpAfterError()

  program
    .command('init')
    .description('create a new pact in the data directory')
    .option('--force', 'overwrite an existing pact')
    .action(initCmd)

  program
    .command('join <key>')
    .description('join an existing pact using its hex key')
    .option('--force', 'overwrite an existing pact')
    .action(joinCmd)

  program.command('invite').description('print the join key for the local pact').action(inviteCmd)

  program
    .command('start')
    .description('start the daemon (REST API on :7331)')
    .option('--daemon', 'detach and run in the background')
    .option('--port <n>', 'REST API port', '7331')
    .option(
      '--bootstrap <list>',
      'comma-separated host:port DHT bootstrap (advanced; default: public DHT)',
    )
    .action(startCmd)

  program
    .command('start-foreground', { hidden: true })
    .option('--port <n>', '', '7331')
    .option('--bootstrap <list>', '')
    .action(startForegroundCmd)

  program
    .command('stop')
    .description('stop a running daemon')
    .option('--timeout <ms>', 'graceful shutdown timeout', '5000')
    .action(stopCmd)

  program
    .command('status')
    .description('show daemon status')
    .option('--port <n>', '', '7331')
    .action(statusCmd)

  program
    .command('peers')
    .description('list connected peers')
    .option('--port <n>', '', '7331')
    .action(peersCmd)

  program
    .command('add-writer <key>')
    .description('promote a peer (by hex public key) to writer or indexer')
    .option('--indexer', 'promote as indexer (participates in consensus)')
    .option('--port <n>', '', '7331')
    .action(addWriterCmd)

  program
    .command('remove-writer <key>')
    .description('remove a peer from the writer set')
    .option('--port <n>', '', '7331')
    .action(removeWriterCmd)

  program
    .command('log')
    .description('print recent shared-memory entries')
    .option('--type <t>', 'filter by entry type (knowledge|task|skill|message)')
    .option('--limit <n>', 'maximum entries to print', '20')
    .option('--port <n>', '', '7331')
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
    console.error(pc.red(`error: ${(err as Error).message}`))
    process.exit(1)
  })
}
