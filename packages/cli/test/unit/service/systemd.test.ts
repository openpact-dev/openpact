import test from 'brittle'
import { renderUnit, systemdPaths } from '../../../src/lib/service/systemd'

test('renderUnit: happy path bakes bin + data-dir + foreground', (t) => {
  const unit = renderUnit({
    binPath: '/usr/local/bin/openpact',
    dataDir: '/home/alice/.openpact',
  })
  t.ok(unit.includes('ExecStart=/usr/local/bin/openpact start --foreground'))
  t.ok(unit.includes('Environment=OPENPACT_DATA_DIR=/home/alice/.openpact'))
  t.ok(unit.includes('Type=simple'))
  t.ok(unit.includes('Restart=on-failure'))
  t.ok(unit.includes('WantedBy=default.target'))
})

test('renderUnit: extra args appended after --foreground', (t) => {
  const unit = renderUnit({
    binPath: '/usr/local/bin/openpact',
    dataDir: '/home/alice/.openpact',
    extraArgs: ['--port', '7777', '--log-level', 'debug'],
  })
  t.ok(
    unit.includes(
      'ExecStart=/usr/local/bin/openpact start --foreground --port 7777 --log-level debug',
    ),
  )
})

test('renderUnit: paths with spaces get quoted', (t) => {
  const unit = renderUnit({
    binPath: '/opt/My Apps/openpact',
    dataDir: '/home/alice/Data Dir/.openpact',
  })
  t.ok(unit.includes('ExecStart="/opt/My Apps/openpact" start --foreground'))
  t.ok(unit.includes('Environment=OPENPACT_DATA_DIR="/home/alice/Data Dir/.openpact"'))
})

test('renderUnit: rejects non-absolute paths', (t) => {
  t.exception(() => renderUnit({ binPath: 'openpact', dataDir: '/x' }), /binPath must be absolute/)
  t.exception(
    () => renderUnit({ binPath: '/x/openpact', dataDir: '.openpact' }),
    /dataDir must be absolute/,
  )
})

test('systemdPaths: XDG user-unit location', (t) => {
  const p = systemdPaths('/home/bob')
  t.is(p.unitName, 'openpact.service')
  t.is(p.unitDir, '/home/bob/.config/systemd/user')
  t.is(p.unitPath, '/home/bob/.config/systemd/user/openpact.service')
})
