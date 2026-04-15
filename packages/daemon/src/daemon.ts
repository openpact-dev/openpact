import EventEmitter from 'events'
import b4a from 'b4a'
import Corestore from 'corestore'
import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import Hyperswarm from 'hyperswarm'

import { defaultDataDir, corestorePath } from './data-dir'
import { loadConfig, saveConfig, DEFAULT_PORT, type Role, type Config } from './config'
import { makeApply } from './apply'
import * as peerHandle from './peer-handle'
import * as entryId from './entry-id'

export interface DaemonOpts {
  dataDir?: string
  port?: number
  swarm?: Record<string, unknown>
  /**
   * How long a `claimed` task remains effectively claimed before
   * peers treat it as open again. All peers in a pact MUST agree on
   * this value (the reducer is deterministic w.r.t. it). Default: 24h.
   */
  claimTtlMs?: number
  /**
   * Wall-clock source used by the route layer when deciding whether
   * a stale claim has expired *now* (vs. the inter-entry checks
   * inside the reducer, which use entry timestamps for determinism).
   * Tests inject a fake clock here. Default: `Date.now`.
   */
  clockMs?: () => number
}

export interface JoinOpts extends DaemonOpts {
  joinKey: string
}

export interface WaitOpts {
  timeout?: number
}

const DEFAULT_CLAIM_TTL_MS = 24 * 60 * 60 * 1000

export class Daemon extends EventEmitter {
  dataDir: string
  port: number
  claimTtlMs: number
  clockMs: () => number
  private _swarmOpts: Record<string, unknown>
  private _store: any = null
  private _base: any = null
  private _swarm: any = null
  private _started = false
  private _role: Role | null = null

  constructor({
    dataDir,
    port = DEFAULT_PORT,
    swarm = {},
    claimTtlMs = DEFAULT_CLAIM_TTL_MS,
    clockMs = Date.now,
  }: DaemonOpts = {}) {
    super()
    this.dataDir = dataDir || defaultDataDir()
    this.port = port
    this._swarmOpts = swarm
    this.claimTtlMs = claimTtlMs
    this.clockMs = clockMs
  }

  static async create(opts: DaemonOpts = {}): Promise<Daemon> {
    const d = new Daemon(opts)
    await d._initStore()
    d._base = new Autobase(d._store, null, d._autobaseOpts())
    await d._base.ready()
    d._role = 'creator'
    await d._persistConfig()
    return d
  }

  static async join(opts: JoinOpts): Promise<Daemon> {
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

  static async load(opts: DaemonOpts = {}): Promise<Daemon> {
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

  private async _initStore(): Promise<void> {
    this._store = new Corestore(corestorePath(this.dataDir))
    await this._store.ready()
  }

  private _autobaseOpts(): Record<string, unknown> {
    return {
      valueEncoding: 'json',
      open: (store: any) => {
        const core = store.get('view')
        return new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' })
      },
      apply: makeApply({
        onInvalid: (info) => this.emit('invalid-entry', info),
        onApplied: (info) => this.emit('entry-applied', info),
      }),
    }
  }

  private async _persistConfig(): Promise<void> {
    const cfg = await loadConfig(this.dataDir)
    cfg.pactKey = b4a.toString(this._base.key, 'hex')
    if (this._role) cfg.role = this._role
    cfg.port = this.port
    await saveConfig(this.dataDir, cfg as Config)
  }

  async start(): Promise<void> {
    if (this._started) return
    this._swarm = new Hyperswarm(this._swarmOpts)
    this._swarm.on('connection', (conn: any) => {
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

  async stop(): Promise<void> {
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

  async append(entry: Record<string, unknown>): Promise<{ id: string; timestamp: string }> {
    if (!this._base.writable) throw new Error('this daemon is not a writer for the pact')
    await this._base.append(entry)
    // Match apply.ts convention: seq = writer length AFTER the append (autobase
    // sets node.length = nodes.length + 1, so apply sees N+1 for the Nth-indexed
    // block). Sequential awaits keep this read consistent.
    const seq = this._base.local.length
    const id = entryId.encode({ writerKey: this._base.local.key, seq })
    return { id, timestamp: entry.timestamp as string }
  }

  async addWriter(
    key: Buffer | string,
    { indexer = false }: { indexer?: boolean } = {},
  ): Promise<void> {
    const keyHex = typeof key === 'string' ? key : (b4a.toString(key, 'hex') as string)
    const adminEntry = {
      type: 'admin',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle,
      display_name: this.displayName,
      payload: { action: 'addWriter', key: keyHex, indexer: !!indexer },
    }
    await this._base.append(adminEntry)
  }

  async removeWriter(key: Buffer | string): Promise<void> {
    const keyHex = typeof key === 'string' ? key : (b4a.toString(key, 'hex') as string)
    const adminEntry = {
      type: 'admin',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle,
      display_name: this.displayName,
      payload: { action: 'removeWriter', key: keyHex },
    }
    await this._base.append(adminEntry)
  }

  async update(): Promise<void> {
    if (this._base) await this._base.update()
  }

  get pactKey(): string | null {
    return this._base ? (b4a.toString(this._base.key, 'hex') as string) : null
  }

  get publicKey(): string | null {
    if (!this._base || !this._base.local) return null
    return b4a.toString(this._base.local.key, 'hex') as string
  }

  get peerHandle(): string | null {
    if (!this._base || !this._base.local) return null
    return peerHandle.derive(this._base.local.key)
  }

  /**
   * Author's chosen display name. Null means "no preference — render
   * the deterministic peerHandle." Slice 4a-2 will thread this from
   * config.json; Slice 4a-1 stamps null to lock in the wire format
   * without waiting for the config surface.
   */
  get displayName(): string | null {
    return null
  }

  get role(): Role | null {
    return this._role
  }

  get isWriter(): boolean {
    return this._base ? !!this._base.writable : false
  }

  get isIndexer(): boolean {
    return this._base ? !!this._base.isIndexer : false
  }

  get connections(): number {
    return this._swarm ? (this._swarm.connections.size as number) : 0
  }

  get viewVersion(): number {
    return this._base && this._base.view ? (this._base.view.version as number) : 0
  }

  // The Hyperbee view backing the autobase. Used by the REST API layer
  // and by integration tests for direct queries. Returns null until start.
  get view(): any {
    return this._base ? this._base.view : null
  }

  async waitForConnections(min = 1, { timeout = 5000 }: WaitOpts = {}): Promise<void> {
    return _wait(
      () => this.connections >= min,
      timeout,
      () => `waitForConnections(${min})`,
    )
  }

  async waitForViewVersion(n: number, { timeout = 5000 }: WaitOpts = {}): Promise<void> {
    return _wait(
      () => this.viewVersion >= n,
      timeout,
      () => `waitForViewVersion(${n}) — current ${this.viewVersion}`,
    )
  }

  async waitForWritable({ timeout = 5000 }: WaitOpts = {}): Promise<void> {
    if (this.isWriter) return
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        this._base.off('writable', onWrite)
        reject(new Error(`waitForWritable timeout`))
      }, timeout)
      const onWrite = (): void => {
        clearTimeout(t)
        resolve()
      }
      this._base.once('writable', onWrite)
    })
  }
}

async function _wait(
  predicate: () => boolean,
  timeout: number,
  label: () => string,
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`timeout: ${label()}`)
}
