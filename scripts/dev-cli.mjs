#!/usr/bin/env node
// Run the OpenPact CLI from source against an isolated dev data-dir
// + ports (7766 / 7767). Keeps the Volta-installed release CLI and its
// live shared-memory daemon untouched on 7666 / 7667.
//
// Auto-injects:
//   --data-dir ~/.openpact-dev  (global, always)
//   --port 7766                 (for subcommands that accept it, except `dashboard`)
//   --port 7767                 (for the `dashboard` subcommand, whose --port means dashboard port)
//   --dashboard-port 7767       (for subcommands that accept it)
//
// Pass-through for anything else, so `node scripts/dev-cli.mjs task add ...`
// works the same as `openpact task add ...`.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(__dirname, '..', 'packages', 'cli', 'src', 'main.ts')
const DATA_DIR = path.join(os.homedir(), '.openpact-dev')
const DAEMON_PORT = '7766'
const DASH_PORT = '7767'

// Daemon-port: the REST API on 7766. All daemon-talking subcommands.
const PORT_CMDS = new Set([
  'init',
  'join',
  'invite',
  'start',
  'status',
  'agents',
  'add-member',
  'remove-member',
  'log',
  'remove',
  'message',
  'record',
])
// Dashboard-port: forwarded to auto-start or used by status output.
const DASH_CMDS = new Set(['init', 'join', 'start', 'status'])
// Subcommand groups where `--port` lives on the nested verb.
const NESTED_PORT_GROUPS = new Set(['task', 'skill'])

const argv = process.argv.slice(2)
if (argv.length === 0) {
  process.stderr.write('usage: node scripts/dev-cli.mjs <openpact subcommand> [args]\n')
  process.exit(2)
}

const sub = argv[0]
const rest = argv.slice(1)

const has = (flag) => rest.includes(flag)

const injected = []
if (sub === 'dashboard' && !has('--port')) {
  // `dashboard` subcommand's --port is the dashboard port, not the daemon.
  injected.push('--port', DASH_PORT)
} else if (PORT_CMDS.has(sub) && !has('--port')) {
  injected.push('--port', DAEMON_PORT)
} else if (NESTED_PORT_GROUPS.has(sub)) {
  // task / skill: nested verb owns the --port flag; splice after the verb.
  if (rest.length > 0 && !has('--port')) injected.push('--port', DAEMON_PORT)
}
if (DASH_CMDS.has(sub) && !has('--dashboard-port')) {
  injected.push('--dashboard-port', DASH_PORT)
}

let forwarded
if (NESTED_PORT_GROUPS.has(sub) && injected.length > 0) {
  // Put injected flags after the nested verb: `task add --port ... <title>`.
  const [verb, ...tail] = rest
  forwarded = verb === undefined ? [] : [verb, ...injected, ...tail]
} else {
  forwarded = [...injected, ...rest]
}

const args = ['tsx', BIN, '--data-dir', DATA_DIR, sub, ...forwarded]
const child = spawn('npx', args, { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
