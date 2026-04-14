const EventEmitter = require('events')
const b4a = require('b4a')
const Corestore = require('corestore')
const Autobase = require('autobase')
const Hyperbee = require('hyperbee')
const Hyperswarm = require('hyperswarm')

const { defaultDataDir, corestorePath } = require('./data-dir')
const { loadConfig, saveConfig, DEFAULT_PORT } = require('./config')
const { makeApply } = require('./apply')
const peerHandle = require('./peer-handle')

class Daemon extends EventEmitter {
  constructor({ dataDir, port = DEFAULT_PORT, swarm = {} } = {}) {
    super()
    this.dataDir = dataDir || defaultDataDir()
    this.port = port
    this._swarmOpts = swarm
    this._store = null
    this._base = null
    this._swarm = null
    this._started = false
    this._role = null
  }

  static async create(opts = {}) {
    const d = new Daemon(opts)
    await d._initStore()
    d._base = new Autobase(d._store, null, d._autobaseOpts())
    await d._base.ready()
    d._role = 'creator'
    await d._persistConfig()
    return d
  }

  static async join(opts = {}) {
    if (!opts.joinKey) throw new Error('joinKey is required to join an existing pact')
    const d = new Daemon(opts)
    await d._initStore()
    const bootstrap = b4a.from(opts.joinKey, 'hex')
    d._base = new Autobase(d._store, bootstrap, d._autobaseOpts())
    await d._base.ready()
    d._role = 'reader'
    await d._persistConfig()
    return d
  }

  static async load(opts = {}) {
    const d = new Daemon(opts)
    await d._initStore()
    const cfg = await loadConfig(d.dataDir)
    if (!cfg.pactKey) {
      throw new Error(`no pact found at ${d.dataDir} — use Daemon.create() or Daemon.join() first`)
    }
    const bootstrap = b4a.from(cfg.pactKey, 'hex')
    d._base = new Autobase(d._store, bootstrap, d._autobaseOpts())
    await d._base.ready()
    d._role = cfg.role
    return d
  }

  async _initStore() {
    this._store = new Corestore(corestorePath(this.dataDir))
    await this._store.ready()
  }

  _autobaseOpts() {
    return {
      valueEncoding: 'json',
      open: (store) => {
        const core = store.get('view')
        return new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' })
      },
      apply: makeApply({
        onInvalid: (info) => this.emit('invalid-entry', info),
        onApplied: (info) => this.emit('entry-applied', info),
      }),
    }
  }

  async _persistConfig() {
    const cfg = await loadConfig(this.dataDir)
    cfg.pactKey = b4a.toString(this._base.key, 'hex')
    if (this._role) cfg.role = this._role
    cfg.port = this.port
    await saveConfig(this.dataDir, cfg)
  }

  async start() {
    if (this._started) return
    this._swarm = new Hyperswarm(this._swarmOpts)
    this._swarm.on('connection', (conn) => {
      this._store.replicate(conn)
      this.emit('peer-add', { remoteKey: b4a.toString(conn.remotePublicKey, 'hex') })
      conn.on('close', () =>
        this.emit('peer-remove', { remoteKey: b4a.toString(conn.remotePublicKey, 'hex') }),
      )
    })
    this._base.on('update', () => this.emit('update'))
    this._swarm.join(this._base.discoveryKey)
    this._started = true
    this.emit('start')
  }

  async stop() {
    this._started = false
    if (this._swarm) {
      await this._swarm.destroy()
      this._swarm = null
    }
    if (this._base) {
      await this._base.close()
      this._base = null
    }
    if (this._store) {
      await this._store.close()
      this._store = null
    }
    this.emit('stop')
  }

  async append(entry) {
    if (!this._base.writable) throw new Error('this daemon is not a writer for the pact')
    await this._base.append(entry)
    return { timestamp: entry.timestamp }
  }

  async addWriter(key, { indexer = false } = {}) {
    const keyHex = typeof key === 'string' ? key : b4a.toString(key, 'hex')
    const adminEntry = {
      type: 'admin',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle,
      payload: { action: 'addWriter', key: keyHex, indexer: !!indexer },
    }
    await this._base.append(adminEntry)
  }

  async removeWriter(key) {
    const keyHex = typeof key === 'string' ? key : b4a.toString(key, 'hex')
    const adminEntry = {
      type: 'admin',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle,
      payload: { action: 'removeWriter', key: keyHex },
    }
    await this._base.append(adminEntry)
  }

  async update() {
    if (this._base) await this._base.update()
  }

  get pactKey() {
    return this._base ? b4a.toString(this._base.key, 'hex') : null
  }

  get publicKey() {
    if (!this._base || !this._base.local) return null
    return b4a.toString(this._base.local.key, 'hex')
  }

  get peerHandle() {
    if (!this._base || !this._base.local) return null
    return peerHandle.derive(this._base.local.key)
  }

  get role() {
    return this._role
  }

  get isWriter() {
    return this._base ? this._base.writable : false
  }

  get isIndexer() {
    return this._base ? this._base.isIndexer : false
  }

  get connections() {
    return this._swarm ? this._swarm.connections.size : 0
  }

  get viewVersion() {
    return this._base && this._base.view ? this._base.view.version : 0
  }

  async waitForConnections(min = 1, { timeout = 5000 } = {}) {
    return _wait(
      () => this.connections >= min,
      timeout,
      () => `waitForConnections(${min})`,
    )
  }

  async waitForViewVersion(n, { timeout = 5000 } = {}) {
    return _wait(
      () => this.viewVersion >= n,
      timeout,
      () => `waitForViewVersion(${n}) — current ${this.viewVersion}`,
    )
  }

  async waitForWritable({ timeout = 5000 } = {}) {
    if (this.isWriter) return
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this._base.off('writable', onWrite)
        reject(new Error(`waitForWritable timeout`))
      }, timeout)
      const onWrite = () => {
        clearTimeout(t)
        resolve()
      }
      this._base.once('writable', onWrite)
    })
  }
}

async function _wait(predicate, timeout, label) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`timeout: ${label()}`)
}

module.exports = { Daemon }
