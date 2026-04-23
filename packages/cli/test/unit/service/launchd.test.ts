import test from 'brittle'
import { renderPlist, launchdPaths } from '../../../src/lib/service/launchd'

test('renderPlist: happy path has Label, ProgramArguments, RunAtLoad', (t) => {
  const plist = renderPlist({
    binPath: '/usr/local/bin/openpact',
    dataDir: '/Users/alice/.openpact',
    logPath: '/Users/alice/.openpact/logs/service.log',
  })
  t.ok(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  t.ok(plist.includes('<string>dev.openpact.daemon</string>'))
  t.ok(plist.includes('<string>/usr/local/bin/openpact</string>'))
  t.ok(plist.includes('<string>start</string>'))
  t.ok(plist.includes('<string>--foreground</string>'))
  t.ok(plist.includes('<key>OPENPACT_DATA_DIR</key>'))
  t.ok(plist.includes('<string>/Users/alice/.openpact</string>'))
  t.ok(plist.includes('<key>RunAtLoad</key>'))
  t.ok(plist.includes('<key>KeepAlive</key>'))
  t.ok(plist.includes('<key>SuccessfulExit</key>'))
})

test('renderPlist: extra args inserted after --foreground', (t) => {
  const plist = renderPlist({
    binPath: '/usr/local/bin/openpact',
    dataDir: '/Users/alice/.openpact',
    logPath: '/Users/alice/.openpact/logs/service.log',
    extraArgs: ['--port', '7777'],
  })
  // Order of <string> lines under ProgramArguments must match the invocation.
  const slice = plist.slice(plist.indexOf('<array>'), plist.indexOf('</array>'))
  const argOrder = slice.match(/<string>([^<]+)<\/string>/g) ?? []
  t.is(argOrder[0], '<string>/usr/local/bin/openpact</string>')
  t.is(argOrder[1], '<string>start</string>')
  t.is(argOrder[2], '<string>--foreground</string>')
  t.is(argOrder[3], '<string>--port</string>')
  t.is(argOrder[4], '<string>7777</string>')
})

test('renderPlist: XML-escapes metachars in paths', (t) => {
  const plist = renderPlist({
    binPath: '/usr/local/bin/open&pact',
    dataDir: '/Users/a&b/.openpact',
    logPath: '/Users/a&b/.openpact/logs/service.log',
  })
  t.ok(plist.includes('<string>/usr/local/bin/open&amp;pact</string>'))
  t.ok(plist.includes('<string>/Users/a&amp;b/.openpact</string>'))
  t.absent(plist.includes('/open&pact</string>'))
})

test('renderPlist: rejects non-absolute paths', (t) => {
  t.exception(
    () => renderPlist({ binPath: 'openpact', dataDir: '/x', logPath: '/x/log' }),
    /binPath must be absolute/,
  )
})

test('launchdPaths: user LaunchAgent location', (t) => {
  const p = launchdPaths('/Users/bob')
  t.is(p.label, 'dev.openpact.daemon')
  t.is(p.agentDir, '/Users/bob/Library/LaunchAgents')
  t.is(p.plistPath, '/Users/bob/Library/LaunchAgents/dev.openpact.daemon.plist')
  t.is(p.logPath('/Users/bob/.openpact'), '/Users/bob/.openpact/logs/service.log')
})
