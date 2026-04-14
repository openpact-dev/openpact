import test from 'brittle'
import { buildProgram } from '../../src/bin'

test('buildProgram: registers all expected commands', (t) => {
  const program = buildProgram()
  const commandNames = program.commands.map((c) => c.name())
  for (const verb of [
    'init',
    'join',
    'invite',
    'start',
    'start-foreground',
    'stop',
    'status',
    'peers',
    'log',
  ]) {
    t.ok(commandNames.includes(verb), `command ${verb} registered`)
  }
})

test('buildProgram: --data-dir is a global option', (t) => {
  const program = buildProgram()
  const opt = program.options.find((o) => o.long === '--data-dir')
  t.ok(opt, '--data-dir present')
})

test('buildProgram: start has --daemon and --port', (t) => {
  const program = buildProgram()
  const start = program.commands.find((c) => c.name() === 'start')!
  const flags = start.options.map((o) => o.long)
  t.ok(flags.includes('--daemon'))
  t.ok(flags.includes('--port'))
})

test('buildProgram: log has --type and --limit', (t) => {
  const program = buildProgram()
  const log = program.commands.find((c) => c.name() === 'log')!
  const flags = log.options.map((o) => o.long)
  t.ok(flags.includes('--type'))
  t.ok(flags.includes('--limit'))
})

test('buildProgram: start-foreground is hidden from help', (t) => {
  const program = buildProgram()
  const sf = program.commands.find((c) => c.name() === 'start-foreground')!
  // Commander stores hidden via the internal _hidden flag; test via help text.
  const help = program.helpInformation()
  t.absent(help.includes('start-foreground'), 'hidden command not in help')
  t.ok(sf, 'but the command is registered')
})
