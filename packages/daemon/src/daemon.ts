import EventEmitter from 'events'
import b4a from 'b4a'
import crypto from 'crypto'
import Hyperswarm from 'hyperswarm'
import Protomux from 'protomux'
import fs from 'fs/promises'

import { defaultDataDir, pactConfigDir } from './data-dir'
import {
  loadDaemonConfig,
  saveDaemonConfig,
  DEFAULT_PORT,
  type Role,
  type DaemonConfig,
  type PactRegistryEntry,
} from './config'
import { Pact } from './pact'
import { RedeemError } from './invites'
import {
  PROTOCOL as INVITE_PROTOCOL,
  redeemRequestEnc,
  redeemResponseEnc,
  type RedeemRequest,
  type RedeemResponse,
} from './invite-wire'

interface PeerLink {
  conn: unknown
  channel: unknown
  sendRequest: (req: RedeemRequest) => boolean
  pending: Map<string, (res: RedeemResponse) => void>
}

export interface DaemonOpts {
  dataDir?: string
  port?: number
  swarm?: Record<string, unknown>
  /** Opt-in metadata forwarded to the first-created pact. Legacy single-pact path. */
  pactName?: string | null
  pactPurpose?: string | null
  displayName?: string | null
  claimTtlMs?: number
  clockMs?: () => number
}

export interface JoinOpts extends DaemonOpts {
  joinKey: string
}

export interface WaitOpts {
  timeout?: number
}

export interface CreatePactOpts {
  /** Short local alias. Auto-slugged from name if omitted. */
  alias?: string
  pactName: string
  pactPurpose?: string | null
  displayName?: string | null
  /** Make this the current pact after creating. Default: true on first pact, false afterwards. */
  setCurrent?: boolean
}

export interface JoinPactOpts {
  alias?: string
  joinKey: string
  displayName?: string | null
  setCurrent?: boolean
}

const DEFAULT_CLAIM_TTL_MS = 24 * 60 * 60 * 1000

/**
 * The process-level host. Owns one Hyperswarm + one port-bound REST
 * server. Holds one or more `Pact` instances in memory, tracks them
 * in the daemon.json registry, and re-emits pact events with a
 * `{pactId}` envelope so downstream consumers (SSE, dashboard) can
 * demultiplex.
 *
 * Backward-shape: the class is still called `Daemon` so every caller
 * keeps its import. New multi-pact methods live alongside the old
 * single-pact `create`/`join`/`load` static factories. The
 * single-pact factories create a default pact and mark it current,
 * so legacy convenience proxies (`daemon.append`, `daemon.view`,
 * etc.) keep working.
 */
export class Daemon extends EventEmitter {
  readonly hostDir: string
  port: number
  claimTtlMs: number
  clockMs: () => number
  private _swarmOpts: Record<string, unknown>
  private _swarm: any = null
  private _started = false
  private _pacts: Map<string /* alias */, Pact> = new Map()
  private _currentAlias: string | null = null
  private _joinedTopics: Set<string> = new Set()
  /** Open invite-protocol links, one per connected peer. */
  private _peerLinks: Set<PeerLink> = new Set()

  constructor({
    dataDir,
    port = DEFAULT_PORT,
    swarm = {},
    claimTtlMs = DEFAULT_CLAIM_TTL_MS,
    clockMs = Date.now,
  }: DaemonOpts = {}) {
    super()
    this.hostDir = dataDir || defaultDataDir()
    this.port = port
    this._swarmOpts = swarm
    this.claimTtlMs = claimTtlMs
    this.clockMs = clockMs
  }

  /** Legacy alias — external callers still reference `.dataDir`. */
  get dataDir(): string {
    return this.hostDir
  }

  // ──────────────────────────────────────────────────────────────────
  // Registry (daemon.json)
  // ──────────────────────────────────────────────────────────────────

  private async _loadRegistry(): Promise<DaemonConfig> {
    const cfg = await loadDaemonConfig(this.hostDir)
    cfg.port = this.port
    return cfg
  }

  private async _saveRegistry(cfg: DaemonConfig): Promise<void> {
    await saveDaemonConfig(this.hostDir, cfg)
  }

  async listPacts(): Promise<PactRegistryEntry[]> {
    const cfg = await this._loadRegistry()
    return cfg.pacts
  }

  async currentAlias(): Promise<string | null> {
    const cfg = await this._loadRegistry()
    return cfg.currentAlias ?? this._currentAlias
  }

  async setCurrentAlias(alias: string | null): Promise<void> {
    const cfg = await this._loadRegistry()
    if (alias !== null) {
      const exists = cfg.pacts.find((p) => p.alias === alias)
      if (!exists) throw new Error(`no pact named ${alias} on this host`)
    }
    cfg.currentAlias = alias
    this._currentAlias = alias
    await this._saveRegistry(cfg)
  }

  async openPact(aliasOrNull: string | null = null): Promise<Pact> {
    const cfg = await this._loadRegistry()
    const alias = aliasOrNull ?? cfg.currentAlias
    if (!alias) throw new Error('no pact specified and no current pact is set')
    const cached = this._pacts.get(alias)
    if (cached) return cached
    const entry = cfg.pacts.find((p) => p.alias === alias)
    if (!entry) throw new Error(`no pact named ${alias} on this host`)
    const pact = await Pact.load({ dataDir: entry.dataDir })
    this._pacts.set(alias, pact)
    this._wireEvents(alias, pact)
    if (this._started) this._joinTopic(pact)
    return pact
  }

  /** Current Pact (must already be open in memory). */
  get current(): Pact | null {
    if (!this._currentAlias) return null
    return this._pacts.get(this._currentAlias) ?? null
  }

  get openPacts(): Pact[] {
    return [...this._pacts.values()]
  }

  private _wireEvents(alias: string, pact: Pact): void {
    const envelope = (event: string) => (payload: any) =>
      this.emit(event, { ...payload, pactId: pact.pactKey, alias })
    pact.on('entry-applied', envelope('entry-applied'))
    pact.on('invalid-entry', envelope('invalid-entry'))
    pact.autobase?.on('update', () => this.emit('update', { pactId: pact.pactKey, alias }))
  }

  // ──────────────────────────────────────────────────────────────────
  // Pact lifecycle
  // ──────────────────────────────────────────────────────────────────

  async createPact(opts: CreatePactOpts): Promise<{ pact: Pact; alias: string }> {
    const cfg = await this._loadRegistry()
    const alias = opts.alias ?? uniqueAliasFromName(opts.pactName, cfg.pacts)
    validateAlias(alias)
    if (cfg.pacts.some((p) => p.alias === alias)) {
      throw new Error(`a pact named ${alias} already exists on this host`)
    }
    const pactDir = pactConfigDir(this.hostDir, alias)
    await fs.mkdir(pactDir, { recursive: true })
    const pact = await Pact.create({
      dataDir: pactDir,
      pactName: opts.pactName,
      pactPurpose: opts.pactPurpose ?? null,
      displayName: opts.displayName ?? null,
    })
    cfg.pacts.push({
      alias,
      pactId: pact.pactKey!,
      dataDir: pactDir,
      addedAt: new Date().toISOString(),
    })
    const shouldSetCurrent = opts.setCurrent ?? cfg.currentAlias === null
    if (shouldSetCurrent) cfg.currentAlias = alias
    await this._saveRegistry(cfg)
    this._pacts.set(alias, pact)
    this._wireEvents(alias, pact)
    if (shouldSetCurrent) this._currentAlias = alias
    if (this._started) this._joinTopic(pact)
    return { pact, alias }
  }

  async joinPact(opts: JoinPactOpts): Promise<{ pact: Pact; alias: string }> {
    const cfg = await this._loadRegistry()
    const alias = opts.alias ?? `joined-${opts.joinKey.slice(0, 8)}`
    validateAlias(alias)
    if (cfg.pacts.some((p) => p.alias === alias)) {
      throw new Error(`a pact named ${alias} already exists on this host`)
    }
    const pactDir = pactConfigDir(this.hostDir, alias)
    await fs.mkdir(pactDir, { recursive: true })
    const pact = await Pact.join({
      dataDir: pactDir,
      joinKey: opts.joinKey,
      displayName: opts.displayName ?? null,
    })
    cfg.pacts.push({
      alias,
      pactId: pact.pactKey!,
      dataDir: pactDir,
      addedAt: new Date().toISOString(),
    })
    const shouldSetCurrent = opts.setCurrent ?? cfg.currentAlias === null
    if (shouldSetCurrent) cfg.currentAlias = alias
    await this._saveRegistry(cfg)
    this._pacts.set(alias, pact)
    this._wireEvents(alias, pact)
    if (shouldSetCurrent) this._currentAlias = alias
    if (this._started) this._joinTopic(pact)
    return { pact, alias }
  }

  async removePact(alias: string): Promise<void> {
    const cfg = await this._loadRegistry()
    const idx = cfg.pacts.findIndex((p) => p.alias === alias)
    if (idx === -1) throw new Error(`no pact named ${alias} on this host`)
    const entry = cfg.pacts[idx]
    const pact = this._pacts.get(alias)
    if (pact) {
      await pact.close()
      this._pacts.delete(alias)
    }
    cfg.pacts.splice(idx, 1)
    if (cfg.currentAlias === alias) {
      cfg.currentAlias = cfg.pacts[0]?.alias ?? null
      this._currentAlias = cfg.currentAlias
    }
    await this._saveRegistry(cfg)
    await fs.rm(entry.dataDir, { recursive: true, force: true })
  }

  async renamePact(oldAlias: string, newAlias: string): Promise<void> {
    validateAlias(newAlias)
    const cfg = await this._loadRegistry()
    const entry = cfg.pacts.find((p) => p.alias === oldAlias)
    if (!entry) throw new Error(`no pact named ${oldAlias} on this host`)
    if (cfg.pacts.some((p) => p.alias === newAlias)) {
      throw new Error(`a pact named ${newAlias} already exists on this host`)
    }
    const newDir = pactConfigDir(this.hostDir, newAlias)
    const openPact = this._pacts.get(oldAlias)
    if (openPact) {
      await openPact.close()
      this._pacts.delete(oldAlias)
    }
    await fs.rename(entry.dataDir, newDir)
    entry.alias = newAlias
    entry.dataDir = newDir
    if (cfg.currentAlias === oldAlias) cfg.currentAlias = newAlias
    await this._saveRegistry(cfg)
    if (openPact) {
      const reloaded = await Pact.load({ dataDir: newDir })
      this._pacts.set(newAlias, reloaded)
      this._wireEvents(newAlias, reloaded)
    }
    if (this._currentAlias === oldAlias) this._currentAlias = newAlias
  }

  // ──────────────────────────────────────────────────────────────────
  // Swarm lifecycle
  // ──────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._started) return
    this._swarm = new Hyperswarm(this._swarmOpts)
    this._swarm.on('connection', (conn: any) => {
      // Attach protomux BEFORE corestore, so our channel shares the
      // same mux that replicate() grabs via Protomux.from().
      const mux: any = Protomux.from(conn)
      const link = this._openInviteChannel(conn, mux)
      this._peerLinks.add(link)

      for (const pact of this._pacts.values()) {
        pact.store.replicate(conn)
      }
      this.emit('peer-add', { remoteKey: b4a.toString(conn.remotePublicKey, 'hex') })
      conn.on('close', () => {
        this._peerLinks.delete(link)
        this.emit('peer-remove', { remoteKey: b4a.toString(conn.remotePublicKey, 'hex') })
      })
    })
    this._started = true
    for (const pact of this._pacts.values()) this._joinTopic(pact)
    this.emit('start')
  }

  /**
   * Open the `openpact/invites/v1` channel on a newly-connected peer.
   * The returned PeerLink is used by redeemThroughPeers() to broadcast
   * requests and correlate responses. Incoming redeem-requests are
   * handled locally and responded to in place.
   */
  private _openInviteChannel(conn: any, mux: any): PeerLink {
    const pending = new Map<string, (res: RedeemResponse) => void>()
    let sendMsg: any = null

    const channel = mux.createChannel({
      protocol: INVITE_PROTOCOL,
      onclose: () => {
        for (const resolve of pending.values()) {
          resolve({
            corr: Buffer.alloc(0),
            ok: false,
            code: 'PEER_DISCONNECTED',
            message: 'peer disconnected before responding',
          })
        }
        pending.clear()
      },
    })
    if (!channel) {
      // peer didn't advertise our protocol — construct a dead link
      return {
        conn,
        channel: null,
        sendRequest: () => false,
        pending,
      }
    }

    const requestMsg = channel.addMessage({
      encoding: redeemRequestEnc,
      onmessage: (req: RedeemRequest) => {
        this._handleRedeemRequest(req)
          .then((res) => sendMsg && sendMsg.send({ ...res, corr: req.corr }))
          .catch((err) =>
            sendMsg &&
            sendMsg.send({
              corr: req.corr,
              ok: false,
              code: 'INTERNAL',
              message: (err as Error).message,
            }),
          )
      },
    })
    const responseMsg = channel.addMessage({
      encoding: redeemResponseEnc,
      onmessage: (res: RedeemResponse) => {
        const key = corrKey(res.corr)
        const resolve = pending.get(key)
        if (resolve) {
          pending.delete(key)
          resolve(res)
        }
      },
    })
    sendMsg = responseMsg
    channel.open()

    return {
      conn,
      channel,
      sendRequest: (req) => requestMsg.send(req),
      pending,
    }
  }

  /** Handle an inbound redeem-request: map to local Pact.redeemInvite and reply. */
  private async _handleRedeemRequest(req: RedeemRequest): Promise<RedeemResponse> {
    const pact = await this._findPactByPactId(req.pactId)
    if (!pact) {
      return { corr: req.corr, ok: false, code: 'UNKNOWN_PACT', message: 'pact not found' }
    }
    try {
      const result = await pact.redeemInvite(req.token, req.writerKey)
      return { corr: req.corr, ok: true, nonce: result.nonce }
    } catch (e) {
      if (e instanceof RedeemError) {
        return { corr: req.corr, ok: false, code: e.code, message: e.message }
      }
      return {
        corr: req.corr,
        ok: false,
        code: 'INTERNAL',
        message: (e as Error).message || 'internal error',
      }
    }
  }

  private async _findPactByPactId(pactId: string): Promise<Pact | null> {
    const hex = pactId.toLowerCase()
    for (const pact of this._pacts.values()) {
      if (pact.pactKey?.toLowerCase() === hex) return pact
    }
    const cfg = await this._loadRegistry()
    const entry = cfg.pacts.find((p) => p.pactId.toLowerCase() === hex)
    if (!entry) return null
    return this.openPact(entry.alias)
  }

  /**
   * Broadcast a redeem-request to every connected peer, resolving on
   * the first `ok: true` response. Rejects with the last terminal
   * error (non-NOT_INDEXER, non-UNKNOWN_PACT) if all peers reject, or
   * times out after `timeoutMs`.
   */
  async redeemThroughPeers(
    pactId: string,
    token: string,
    writerKey: string,
    { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
  ): Promise<{ ok: true; nonce: string } | { ok: false; code: string; message: string }> {
    if (this._peerLinks.size === 0) {
      return { ok: false, code: 'NO_PEERS', message: 'no peers connected' }
    }
    const corr = crypto.randomBytes(8)
    const req: RedeemRequest = { pactId, token, writerKey, corr }
    const responses: RedeemResponse[] = []

    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        // Timeout — summarise best-known failure
        const last = responses.at(-1)
        resolve(
          last
            ? { ok: false, code: last.code || 'TIMEOUT', message: last.message || 'timeout' }
            : { ok: false, code: 'NO_INDEXER_REACHABLE', message: 'no indexer responded' },
        )
      }, timeoutMs)

      const done = (res: RedeemResponse) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (res.ok && res.nonce) resolve({ ok: true, nonce: res.nonce })
        else
          resolve({
            ok: false,
            code: res.code || 'UNKNOWN',
            message: res.message || 'redeem failed',
          })
      }

      let outstanding = 0
      for (const link of this._peerLinks) {
        if (!link.channel) continue
        const ok = link.sendRequest(req)
        if (!ok) continue
        outstanding++
        link.pending.set(corrKey(corr), (res) => {
          responses.push(res)
          // First success wins; otherwise wait for all replies then
          // resolve with the "best" (non-NOT_INDEXER, non-UNKNOWN_PACT)
          // failure if any, else NOT_INDEXER.
          if (res.ok) return done(res)
          outstanding--
          if (outstanding === 0) {
            const terminal = responses.find(
              (r) => !r.ok && r.code !== 'INVITE_NOT_INDEXER' && r.code !== 'UNKNOWN_PACT',
            )
            if (terminal) return done(terminal)
            done(responses[0])
          }
        })
      }

      if (outstanding === 0) {
        settled = true
        clearTimeout(timer)
        resolve({
          ok: false,
          code: 'NO_INDEXER_REACHABLE',
          message: 'no peer accepted the invite channel',
        })
      }
    })
  }

  private _joinTopic(pact: Pact): void {
    if (!this._swarm) return
    const discoveryKey = pact.discoveryKey
    if (!discoveryKey) return
    const hex = b4a.toString(discoveryKey, 'hex') as string
    if (this._joinedTopics.has(hex)) return
    this._swarm.join(discoveryKey)
    this._joinedTopics.add(hex)
  }

  async stop(): Promise<void> {
    this._started = false
    if (this._swarm) {
      await this._swarm.destroy()
      this._swarm = null
    }
    for (const pact of this._pacts.values()) {
      await pact.close()
    }
    this._pacts.clear()
    this._joinedTopics.clear()
    this.emit('stop')
  }

  get connections(): number {
    return this._swarm ? (this._swarm.connections.size as number) : 0
  }

  // ──────────────────────────────────────────────────────────────────
  // Legacy single-pact convenience proxies (operate on current pact)
  // ──────────────────────────────────────────────────────────────────

  private _requireCurrent(label: string): Pact {
    const cur = this.current
    if (!cur) throw new Error(`${label} needs a current pact; call openPact() first`)
    return cur
  }

  get pactKey(): string | null {
    return this.current?.pactKey ?? null
  }
  get publicKey(): string | null {
    return this.current?.publicKey ?? null
  }
  get peerHandle(): string | null {
    return this.current?.peerHandle ?? null
  }
  get displayName(): string | null {
    return this.current?.displayName ?? null
  }
  get pactName(): string | null {
    return this.current?.pactName ?? null
  }
  get pactPurpose(): string | null {
    return this.current?.pactPurpose ?? null
  }
  get role(): Role | null {
    return this.current?.role ?? null
  }
  get isWriter(): boolean {
    return this.current?.isWriter ?? false
  }
  get isIndexer(): boolean {
    return this.current?.isIndexer ?? false
  }
  get viewVersion(): number {
    return this.current?.viewVersion ?? 0
  }
  get view(): any {
    return this.current?.view ?? null
  }

  async append(entry: Record<string, unknown>): Promise<{ id: string; timestamp: string }> {
    return this._requireCurrent('append').append(entry)
  }
  async addWriter(key: Buffer | string, opts: { indexer?: boolean } = {}): Promise<void> {
    return this._requireCurrent('addWriter').addWriter(key, opts)
  }
  async removeWriter(key: Buffer | string): Promise<void> {
    return this._requireCurrent('removeWriter').removeWriter(key)
  }
  async setPactInfo(opts: { name?: string | null; purpose?: string | null }): Promise<void> {
    return this._requireCurrent('setPactInfo').setPactInfo(opts)
  }
  async setDisplayName(name: string | null): Promise<void> {
    return this._requireCurrent('setDisplayName').setDisplayName(name)
  }
  async update(): Promise<void> {
    if (this.current) await this.current.update()
  }

  // ──────────────────────────────────────────────────────────────────
  // Single-pact static factories (preserved so existing callers keep
  // working). Each creates/joins exactly one pact and marks it current.
  // ──────────────────────────────────────────────────────────────────

  static async create(opts: DaemonOpts = {}): Promise<Daemon> {
    const d = new Daemon(opts)
    await d.createPact({
      alias: 'default',
      pactName: opts.pactName ?? 'default',
      pactPurpose: opts.pactPurpose ?? null,
      displayName: opts.displayName ?? null,
      setCurrent: true,
    })
    return d
  }

  static async join(opts: JoinOpts): Promise<Daemon> {
    if (!opts.joinKey) throw new Error('joinKey is required to join an existing pact')
    const d = new Daemon(opts)
    await d.joinPact({
      alias: 'default',
      joinKey: opts.joinKey,
      displayName: opts.displayName ?? null,
      setCurrent: true,
    })
    return d
  }

  /** Open every pact from the registry. currentAlias (or first pact) becomes current. */
  static async load(opts: DaemonOpts = {}): Promise<Daemon> {
    const d = new Daemon(opts)
    const cfg = await loadDaemonConfig(d.hostDir)
    if (cfg.pacts.length === 0) {
      throw new Error(
        `no pacts found at ${d.hostDir} — run \`openpact init\` or Daemon.create() first`,
      )
    }
    for (const entry of cfg.pacts) {
      const pact = await Pact.load({ dataDir: entry.dataDir })
      d._pacts.set(entry.alias, pact)
      d._wireEvents(entry.alias, pact)
    }
    d._currentAlias = cfg.currentAlias ?? cfg.pacts[0].alias
    return d
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
    const pact = this._requireCurrent('waitForWritable')
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        pact.autobase?.off('writable', onWrite)
        reject(new Error(`waitForWritable timeout`))
      }, timeout)
      const onWrite = (): void => {
        clearTimeout(t)
        resolve()
      }
      pact.autobase?.once('writable', onWrite)
    })
  }
}

function validateAlias(alias: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(alias) || alias.length > 48) {
    throw new Error(
      `alias must be lowercase alphanumeric + hyphen, start with alnum, ≤48 chars (got ${alias})`,
    )
  }
}

function uniqueAliasFromName(name: string, existing: PactRegistryEntry[]): string {
  const base = slugify(name) || 'pact'
  if (!existing.some((p) => p.alias === base)) return base
  for (let i = 2; i < 9999; i++) {
    const candidate = `${base}-${i}`
    if (!existing.some((p) => p.alias === candidate)) return candidate
  }
  throw new Error('could not find a unique alias')
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
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

function corrKey(buf: Buffer): string {
  return b4a.toString(buf, 'hex') as string
}
