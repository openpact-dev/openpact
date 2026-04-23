import test from 'brittle'
import { buildExtraArgs, resolveBin } from '../../../src/commands/service'

test('buildExtraArgs: all defaults → empty', (t) => {
  t.alike(buildExtraArgs({}), [])
  t.alike(buildExtraArgs({ port: '7666', dashboardPort: '7667' }), [])
})

test('buildExtraArgs: custom port and dashboard port', (t) => {
  t.alike(buildExtraArgs({ port: '7777', dashboardPort: '7668' }), [
    '--port',
    '7777',
    '--dashboard-port',
    '7668',
  ])
})

test('buildExtraArgs: noDashboard flag + logLevel', (t) => {
  t.alike(buildExtraArgs({ noDashboard: true, logLevel: 'debug' }), [
    '--no-dashboard',
    '--log-level',
    'debug',
  ])
})

test('resolveBin: --bin override wins when absolute', (t) => {
  t.is(resolveBin('/opt/openpact/bin/openpact'), '/opt/openpact/bin/openpact')
})

test('resolveBin: relative --bin rejected', (t) => {
  t.exception(() => resolveBin('openpact'), /absolute path/)
  t.exception(() => resolveBin('./bin/openpact'), /absolute path/)
})

test('resolveBin: falls back to argv[1] when no override', (t) => {
  t.is(resolveBin(undefined, '/usr/local/bin/openpact'), '/usr/local/bin/openpact')
})

test('resolveBin: empty argv[1] throws a specific error', (t) => {
  // Pass empty string explicitly — default param only triggers when the arg
  // is omitted entirely, and we want to exercise the `!entry` guard.
  t.exception(() => resolveBin(undefined, ''), /cannot detect openpact binary path/)
})
