import EventEmitter from 'events'
import b4a from 'b4a'
import Corestore from 'corestore'
import Autobase from 'autobase'
import Hyperbee from 'hyperbee'

import { pactStorePath } from './data-dir'
import { loadPactConfig, savePactConfig, type Role, type PactConfig } from './config'
import { makeApply } from './apply'
import * as peerHandle from './peer-handle'
import * as entryId from './entry-id'

export interface PactOpts {
  /** Directory holding the pact's config.json + data/ store. */
  dataDir: string
  /** Creator-only: pact name to persist on create. */
  pactName?: string | null
  /** Creator-only: purpose statement to persist on create. */
  pactPurpose?: string | null
  /** This peer's display name (any role). */
  displayName?: string | null
}

export type PactCreateOpts = PactOpts

export interface PactJoinOpts extends PactOpts {
  /** 64-hex pact key from the creator's `openpact invite` output. */
  joinKey: string
}

/**
 * One append-only memory: a single Autobase view over one Corestore,
 * plus the PactConfig that identifies the pact and this peer's place
 * in it. A process may hold many Pacts at once — see `Daemon` in
 * `daemon.ts` for the host that owns the swarm and the registry.
 *
 * Events (same surface a single-pact Daemon emitted):
 *   - `entry-applied` {kind, entry, node, key?}
 *   - `invalid-entry` {reason, node, entry?, errors?}
 *   - `update` — the Hyperbee view advanced
 */
export class Pact extends EventEmitter {
  readonly dataDir: string
  private _store: any = null
  private _base: any = null
  private _role: Role | null = null
  private _pactName: string | null = null
  private _pactPurpose: string | null = null
  private _displayName: string | null = null

  private constructor(opts: PactOpts) {
    super()
    this.dataDir = opts.dataDir
    this._pactName = opts.pactName ?? null
    this._pactPurpose = opts.pactPurpose ?? null
    this._displayName = opts.displayName ?? null
  }

  /** Create a brand-new pact. Writes config.json as creator. */
  static async create(opts: PactCreateOpts): Promise<Pact> {
    const p = new Pact(opts)
    await p._initStore()
    p._base = new Autobase(p._store, null, p._autobaseOpts())
    await p._base.ready()
    p._role = 'creator'
    await p._persistConfig()
    return p
  }

  /** Join an existing pact by its hex key. Writes config.json as reader. */
  static async join(opts: PactJoinOpts): Promise<Pact> {
    if (!opts.joinKey) throw new Error('joinKey is required to join an existing pact')
    const p = new Pact(opts)
    await p._initStore()
    const bootstrap = b4a.from(opts.joinKey, 'hex')
    p._base = new Autobase(p._store, bootstrap, p._autobaseOpts())
    await p._base.ready()
    p._role = 'reader'
    await p._persistConfig()
    return p
  }

  /** Open an already-initialised pact from disk. */
  static async load(opts: PactOpts): Promise<Pact> {
    const p = new Pact(opts)
    await p._initStore()
    const cfg = await loadPactConfig(p.dataDir)
    if (!cfg.pactKey) {
      throw new Error(`no pact found at ${p.dataDir} — use Pact.create() or Pact.join() first`)
    }
    const bootstrap = b4a.from(cfg.pactKey, 'hex')
    p._base = new Autobase(p._store, bootstrap, p._autobaseOpts())
    await p._base.ready()
    p._role = cfg.role
    p._pactName = opts.pactName ?? cfg.pactName ?? null
    p._pactPurpose = opts.pactPurpose ?? cfg.pactPurpose ?? null
    p._displayName = opts.displayName ?? cfg.displayName ?? null
    if (
      p._pactName !== cfg.pactName ||
      p._pactPurpose !== cfg.pactPurpose ||
      p._displayName !== cfg.displayName
    ) {
      await p._persistConfig()
    }
    return p
  }

  private async _initStore(): Promise<void> {
    this._store = new Corestore(pactStorePath(this.dataDir))
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
    const cfg = await loadPactConfig(this.dataDir)
    cfg.pactKey = b4a.toString(this._base.key, 'hex')
    if (this._role) cfg.role = this._role
    cfg.pactName = this._pactName
    cfg.pactPurpose = this._pactPurpose
    cfg.displayName = this._displayName
    await savePactConfig(this.dataDir, cfg as PactConfig)
  }

  /** The discovery key the pact listens on (raw buffer, for swarm.join). */
  get discoveryKey(): Buffer | null {
    return this._base ? (this._base.discoveryKey as Buffer) : null
  }

  /** The internal corestore — used by the host to pipe over swarm connections. */
  get store(): any {
    return this._store
  }

  /** The autobase instance — used by the host to subscribe to `update`. */
  get autobase(): any {
    return this._base
  }

  /** The Hyperbee view backing the autobase. */
  get view(): any {
    return this._base ? this._base.view : null
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

  get displayName(): string | null {
    return this._displayName
  }

  get pactName(): string | null {
    return this._pactName
  }

  get pactPurpose(): string | null {
    return this._pactPurpose
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

  get viewVersion(): number {
    return this._base && this._base.view ? (this._base.view.version as number) : 0
  }

  async setPactInfo({
    name,
    purpose,
  }: {
    name?: string | null
    purpose?: string | null
  }): Promise<void> {
    if (name !== undefined) this._pactName = name || null
    if (purpose !== undefined) this._pactPurpose = purpose || null
    await this._persistConfig()
  }

  async setDisplayName(name: string | null): Promise<void> {
    this._displayName = name || null
    await this._persistConfig()
  }

  async append(entry: Record<string, unknown>): Promise<{ id: string; timestamp: string }> {
    if (!this._base.writable) throw new Error('this peer is not a writer for the pact')
    await this._base.append(entry)
    const seq = this._base.local.length
    const id = entryId.encode({ writerKey: this._base.local.key, seq })
    return { id, timestamp: entry.timestamp as string }
  }

  async addWriter(
    key: Buffer | string,
    { indexer = false }: { indexer?: boolean } = {},
  ): Promise<void> {
    const keyHex = typeof key === 'string' ? key : (b4a.toString(key, 'hex') as string)
    await this._base.append({
      type: 'admin',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle,
      display_name: this.displayName,
      payload: { action: 'addWriter', key: keyHex, indexer: !!indexer },
    })
  }

  async removeWriter(key: Buffer | string): Promise<void> {
    const keyHex = typeof key === 'string' ? key : (b4a.toString(key, 'hex') as string)
    await this._base.append({
      type: 'admin',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle,
      display_name: this.displayName,
      payload: { action: 'removeWriter', key: keyHex },
    })
  }

  async update(): Promise<void> {
    if (this._base) await this._base.update()
  }

  /**
   * Close the store + autobase handles. The swarm is owned by the
   * host and is closed separately — this just releases the files.
   */
  async close(): Promise<void> {
    if (this._base) {
      await this._base.close()
      this._base = null
    }
    if (this._store) {
      await this._store.close()
      this._store = null
    }
  }
}
