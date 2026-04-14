const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const { Daemon } = require('../../src/daemon')

async function makeTmpDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-d-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

async function tmpDaemon(t, opts = {}) {
  const dir = await makeTmpDir(t)
  const factory = opts.joinKey ? Daemon.join : Daemon.create
  const daemon = await factory({ dataDir: dir, ...opts })
  if (opts.start !== false) await daemon.start()
  t.teardown(() => daemon.stop())
  return { daemon, dir }
}

module.exports = { tmpDaemon, makeTmpDir }
