import { Command } from 'commander'
import { c, emoji, banner } from './lib/theme'
import { CLI_VERSION } from './lib/cli-version'
import { initCmd } from './commands/init'
import { joinCmd } from './commands/join'
import { inviteCmd } from './commands/invite'
import { startCmd } from './commands/start'
import { startForegroundCmd } from './commands/start-foreground'
import { stopCmd } from './commands/stop'
import { statusCmd } from './commands/status'
import { agentsCmd } from './commands/agents'
import { logCmd } from './commands/log'
import { addMemberCmd } from './commands/add-writer'
import { removeMemberCmd } from './commands/remove-writer'
import { dashboardCmd } from './commands/dashboard'
import { listCmd } from './commands/list'
import { switchCmd } from './commands/switch'
import { removeCmd } from './commands/remove'
import { renameCmd } from './commands/rename'
import { registerInstallCommand } from './commands/install'
import { registerHookCommand } from './commands/hook'
import { registerServiceCommand } from './commands/service'
import { messageCmd } from './commands/message'
import { recordCmd } from './commands/record'
import { registerTaskCommand } from './commands/task'
import { registerSkillCommand } from './commands/skill'

export function buildProgram(): Command {
  const program = new Command()
    .name('openpact')
    .description(
      `${emoji.brand} OpenPact. A pact among daemons. P2P shared memory for software agents.`,
    )
    .version(CLI_VERSION)
    .option('--data-dir <path>', 'override data directory (default: ~/.openpact)')
    .enablePositionalOptions()
    .showHelpAfterError()

  // Banner on top-level help only — not on subcommand help (would be noisy
  // on every `openpact <verb> --help`).
  program.addHelpText('before', banner())

  program
    .command('init')
    .description('seal a new pact; auto-starts the daemon when run from a TTY')
    .option('--force', 'break the existing pact at this alias and seal a fresh one')
    .option('--alias <str>', 'short local alias (default: slug of the pact name)')
    .option('--name <str>', 'pact name (e.g. "The Obsidian Accord")')
    .option('--purpose <str>', 'one-line purpose statement for the pact')
    .option('--display-name <str>', 'agent display name (advisory; peer handle stays canonical)')
    .option('--no-interactive', 'skip prompts (use defaults or flags only; for CI / pipes)')
    .option('--no-start', "don't auto-start the daemon after init")
    .option('--no-open', "don't open the dashboard in the default browser")
    .option('--port <n>', 'REST API port (forwarded to auto-start)', '7666')
    .option('--dashboard-port <n>', 'dashboard port (forwarded to auto-start)', '7667')
    .action(initCmd)

  program
    .command('join <token>')
    .description('redeem a one-time invite token; joins the pact and becomes a member')
    .option('--alias <str>', 'short local alias (default: slug of the pact name)')
    .option('--display-name <str>', 'agent display name (advisory; peer handle stays canonical)')
    .option('--no-interactive', 'skip prompts (use defaults or flags only; for CI / pipes)')
    .option('--port <n>', 'REST port of the running daemon', '7666')
    .option('--timeout <s>', 'how long to wait for an indexer peer (seconds)', '30')
    .option('--no-dashboard', "don't start the dashboard if the daemon needs to be auto-started")
    .option('--dashboard-port <n>', 'dashboard port forwarded to auto-start', '7667')
    .action(joinCmd)

  program
    .command('invite')
    .description('mint a one-time invite token (share to add a new member)')
    .option('--pact <alias>', 'pact to invite into (default: current pact)')
    .option('--port <n>', 'REST port of the running daemon', '7666')
    .option('--ttl <duration>', 'invite TTL (e.g. 1h, 24h, 7d)', '7d')
    .option('--list', 'show live + dead invites for this pact instead of minting')
    .option('--revoke <nonce>', 'revoke an invite by nonce instead of minting')
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
    .option('--log-level <level>', 'pino log level (fatal|error|warn|info|debug|trace|silent)')
    .option(
      '--log-file <path>',
      'JSON log sink (default <data-dir>/logs/daemon.log; pass `-` to disable)',
    )
    .action(startCmd)

  program
    .command('start-foreground', { hidden: true })
    .option('--port <n>', '', '7666')
    .option('--bootstrap <list>', '')
    .option('--no-dashboard', '')
    .option('--dashboard-port <n>', '')
    .option('--log-level <level>', '')
    .option('--log-file <path>', '')
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
    .description('show status of the current pact, or the daemon when no pacts exist')
    .option('--port <n>', '', '7666')
    .option('--pact <alias>', 'operate on a specific pact (default: current)')
    .option('--dashboard-port <n>', 'dashboard port for the link line', '7667')
    .action(statusCmd)

  program
    .command('agents')
    .description('list agents bound to the pact')
    .option('--port <n>', '', '7666')
    .option('--pact <alias>', 'operate on a specific pact (default: current)')
    .action(agentsCmd)

  program
    .command('add-member <key>')
    .description('bind an agent (by hex public key) as a member or indexer')
    .option('--indexer', 'bind as indexer (participates in consensus)')
    .option('--port <n>', '', '7666')
    .option('--pact <alias>', 'operate on a specific pact (default: current)')
    .action(addMemberCmd)

  program
    .command('remove-member <key>')
    .description('sever a peer from the member set')
    .option('--port <n>', '', '7666')
    .option('--pact <alias>', 'operate on a specific pact (default: current)')
    .action(removeMemberCmd)

  program
    .command('log')
    .description('print recent entries from the pact')
    .option('--type <t>', 'filter by entry type (knowledge|task|skill|message)')
    .option('--limit <n>', 'maximum entries to print', '20')
    .option('--port <n>', '', '7666')
    .option('--pact <alias>', 'operate on a specific pact (default: current)')
    .action(logCmd)

  // Multi-pact registry commands.
  program
    .command('list')
    .description('list every pact on this host')
    .option('--json', 'emit machine-readable JSON')
    .action(listCmd)

  program
    .command('switch <alias>')
    .description('set the current pact (commands without --pact will default to it)')
    .action(switchCmd)

  program
    .command('remove <alias>')
    .description('leave a pact and delete its local data (destructive)')
    .option('--yes', 'skip the type-to-confirm prompt (required in CI/pipes)')
    .option('--no-interactive', 'skip prompts')
    .option('--port <n>', 'daemon port (when routing through REST)', (v) => Number(v))
    .action(removeCmd)

  program
    .command('rename <oldAlias> <newAlias>')
    .description("change a pact's local alias (pact_id unchanged)")
    .action(renameCmd)

  // Integration installers (Claude Code hooks today; Cursor/Codex/OpenCode next).
  registerInstallCommand(program)

  // Service installer (systemd / launchd).
  registerServiceCommand(program)

  // Hook runtime invoked by Claude Code when install wires it up.
  registerHookCommand(program)

  // Write verbs for humans at a terminal. Agents keep using curl/SDK/MCP.
  program
    .command('message <content>')
    .description(
      'broadcast a short message to the current pact (content renders as markdown on the dashboard)',
    )
    .option('--priority <p>', 'low | normal | high')
    .option('--reply-to <id>', 'thread this message under a parent entry id')
    .option('--pact <alias>', 'pact to write to (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action(messageCmd)

  program
    .command('record <content>')
    .description(
      'record a knowledge entry (a decision, a convention, a workaround); content renders as markdown on the dashboard',
    )
    .requiredOption('--topic <t>', 'short, reusable topic (e.g. routing, auth, db-schema)')
    .option('--source <s>', 'optional pointer (PR link, commit, person)')
    .option('--pact <alias>', 'pact to write to (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action(recordCmd)

  registerTaskCommand(program)
  registerSkillCommand(program)

  return program
}

export async function run(argv = process.argv): Promise<void> {
  const program = buildProgram()
  try {
    await program.parseAsync(argv)
  } catch (err) {
    console.error(`${emoji.cross} ${c.brand((err as Error).message)}`)
    process.exit(1)
  }
}
