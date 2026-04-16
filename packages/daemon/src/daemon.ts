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
import type { RedeemRequest, RedeemResponse } from './invite-wire'
import type { MemberAuthRequest, MemberAuthResponse } from './member-auth-wire'
import {
  type PeerLink,
  newPeerLink,
  destroyPeerLink,
  clearRevocationTimer,
  scheduleRevocationDisconnect,
  attachPactToLink,
  corrKey,
} from './peer-link'
import { openInviteChannel } from './invite-channel'
import { openMemberAuthChannel, requestMemberAuth } from './member-auth-channel'
import { ERROR_CODES, type ErrorCode } from './error-codes'

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
  /** Advisory label persisted to local config. Typically seeded from the invite token. */
  pactName?: string | null
  pactPurpose?: string | null
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
  private _stopped = false
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
    const announce = () => {
      pact.announceDisplayNameIfStale().catch(() => {
        // swallow — announce is best-effort; see Pact._announceDisplayName
      })
    }
    pact.autobase?.on('update', () => {
      this.emit('update', { pactId: pact.pactKey, alias })
      void this._reconcilePactLinks(pact)
      announce()
    })
    pact.autobase?.on('writable', () => {
      void this._reconcilePactLinks(pact)
      announce()
      // A joiner only becomes writable after admission has landed on
      // their view. At swarm-connect time we bailed out of member-auth
      // because we weren't yet a member; now that we are, retry for
      // every live link. Three-wave schedule (0 / 250 / 1000 ms) matches
      // the swarm-connect path, which absorbs any channel-handshake race.
      for (const link of this._peerLinks) this._scheduleMemberAuth(link)
    })
    // Fire once for pacts that are already writable (creators, or
    // pre-admitted loaded pacts). The autobase 'writable' event only
    // emits on transition, not on open.
    if (pact.isWriter) announce()
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
      pactName: opts.pactName ?? null,
      pactPurpose: opts.pactPurpose ?? null,
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
      // Members get two parting entries: a human-readable farewell
      // message so peers can surface "X left the pact", followed by a
      // self-targeted admin.removeWriter so the ledger drops them from
      // the active writer set. Both are best-effort — a reader can't
      // append either and we still need to proceed with teardown.
      // Self-revocation may also fail for a sole-indexer (autobase
      // refuses to remove the last indexer); we log-and-continue in that
      // case since the local cleanup still has to happen.
      if (pact.isMember && pact.peerHandle) {
        try {
          await pact.append({
            type: 'message',
            timestamp: new Date().toISOString(),
            agent_id: pact.peerHandle,
            display_name: pact.displayName,
            payload: {
              content: `${pact.displayName ?? pact.peerHandle} has left the pact.`,
              kind: 'leave',
            },
          })
        } catch {
          // non-fatal
        }
        let didRevoke = false
        try {
          didRevoke = await pact.leaveAsWriter()
        } catch {
          // non-fatal — likely the last-indexer case.
        }
        // Give autobase a window to flush both entries to any currently
        // connected peer before we tear down the pact locally. If we
        // skipped the revocation (sole indexer) there's nobody to flush
        // to, so the sleep is pointless.
        if (didRevoke) await new Promise((r) => setTimeout(r, 2000))
      }
      // Stop announcing the topic so the swarm won't re-attach to this
      // pact on reconnect. The existing conn may persist if shared with
      // other pacts — that's fine.
      const discoveryKey = pact.discoveryKey
      if (this._swarm && discoveryKey) {
        const topicHex = b4a.toString(discoveryKey, 'hex') as string
        try {
          await this._swarm.leave(discoveryKey)
        } catch {
          // non-fatal
        }
        this._joinedTopics.delete(topicHex)
      }
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
    // Hyperswarm itself emits 'error' for DHT bootstrap / topic-join
    // failures. A missing listener would tear the daemon down — log
    // and keep going; the swarm retries internally.
    this._swarm.on('error', (err: Error) => {
      this.emit('swarm-error', { error: err })
    })
    this._swarm.on('connection', (conn: any) => {
      // Phase 3a: every Hyperswarm socket is a Pear "noise" stream
      // that emits 'error' on transport faults (peer reset the link,
      // protocol mismatch, etc). Without a listener Node treats it as
      // an unhandled 'error' and crashes the whole process — fatal in
      // production where one flaky peer would take the daemon down.
      // We log + swallow; the matching 'close' handler below cleans up
      // the link state.
      conn.on('error', (err: Error) => {
        this.emit('peer-error', {
          remoteKey: conn.remotePublicKey ? b4a.toString(conn.remotePublicKey, 'hex') : null,
          error: err,
        })
      })
      // Attach protomux BEFORE corestore, so our channel shares the
      // same mux that replicate() grabs via Protomux.from().
      const mux: any = Protomux.from(conn)
      const link = newPeerLink(conn)
      openInviteChannel(link, mux, {
        handleRedeemRequest: (req) => this._handleRedeemRequest(req),
        onAdmission: (l, pactId, writerKey) =>
          this._bootstrapReplicationForAdmission(l, pactId, writerKey),
      })
      openMemberAuthChannel(link, mux, {
        handleMemberAuthRequest: (req) => this._handleMemberAuthRequest(req),
      })
      this._peerLinks.add(link)

      this._scheduleMemberAuth(link)
      this.emit('peer-add', { remoteKey: b4a.toString(conn.remotePublicKey, 'hex') })
      conn.on('close', () => {
        this._peerLinks.delete(link)
        for (const timer of link.revocationTimers.values()) clearTimeout(timer)
        link.revocationTimers.clear()
        // Surface a member-offline for each pact this link was
        // authenticated on; the dashboard uses this to flip online
        // state without waiting for the next autobase tick.
        for (const [pactId, memberKey] of link.authenticatedMembers) {
          this.emit('member-offline', {
            pactId,
            alias: this._aliasForPactKey(pactId),
            member_key: memberKey,
          })
        }
        link.authenticatedMembers.clear()
        this.emit('peer-remove', { remoteKey: b4a.toString(conn.remotePublicKey, 'hex') })
      })
    })
    this._started = true
    for (const pact of this._pacts.values()) this._joinTopic(pact)
    this.emit('start')
  }

  private async _handleMemberAuthRequest(req: MemberAuthRequest): Promise<MemberAuthResponse> {
    const pact = await this._findPactByPactId(req.pactId)
    if (!pact) {
      return { corr: req.corr, ok: false, code: 'UNKNOWN_PACT', message: 'pact not found' }
    }
    const proof = pact.signMembershipChallenge(req.challenge, req.pactId)
    return {
      corr: req.corr,
      ok: true,
      memberKey: proof.memberKey,
      signerKey: proof.signerKey,
      signerNamespace: proof.signerNamespace,
      compat: proof.compat,
      signature: proof.signature,
    }
  }

  private _requestMemberAuth(link: PeerLink, pact: Pact): Promise<void> {
    return requestMemberAuth(link, pact, {
      onMemberAuthenticated: (pactKey, memberKey) => {
        this.emit('member-online', {
          pactId: pactKey,
          alias: this._aliasForPactKey(pactKey),
          member_key: memberKey,
        })
      },
    })
  }

  private async _bootstrapReplicationForAdmission(
    link: PeerLink,
    pactId: string,
    memberKey: string,
  ): Promise<void> {
    const pact = await this._findPactByPactId(pactId)
    if (!pact) return
    const pactKey = pactId.toLowerCase()
    const claimedKey = memberKey.toLowerCase()
    // Called from two code paths with different semantics:
    //   1. Creator inbound: memberKey = the JOINER's writer key (remote).
    //      Setting authenticatedMembers = joiner is correct; it says
    //      "this link's remote identity is the joiner".
    //   2. Joiner outbound: memberKey = the JOINER's OWN writer key
    //      (what we just had admitted). Writing that into
    //      authenticatedMembers would poison the map with self, because
    //      every downstream consumer (_requestMemberAuth's "already
    //      authed, skip" guard; peers.ts presence lookup) expects the
    //      REMOTE's key. The result was the joiner never initiating
    //      auth against the creator, so the creator stayed "offline"
    //      on the joiner's Network forever.
    //
    // Detect the joiner-outbound case by comparing to our own writer
    // key for the pact and skip the claim/auth writes. Replication
    // attach still runs so the new writer's core reaches the peer.
    const selfKey = pact.publicKey?.toLowerCase()
    const isOwnKey = !!selfKey && selfKey === claimedKey
    if (!isOwnKey) {
      link.claimedMembers.set(pactKey, claimedKey)
      clearRevocationTimer(link, pactKey)
      const wasAuthed = link.authenticatedMembers.has(pactKey)
      link.authenticatedMembers.set(pactKey, claimedKey)
      if (!wasAuthed) {
        this.emit('member-online', {
          pactId: pact.pactKey,
          alias: this._aliasForPactKey(pact.pactKey),
          member_key: claimedKey,
        })
      }
    }
    attachPactToLink(pact, link)
  }

  private async _reconcilePactLinks(pact: Pact): Promise<void> {
    const pactId = pact.pactKey?.toLowerCase()
    if (!pactId) return
    for (const link of this._peerLinks) {
      const remoteMemberKey = link.authenticatedMembers.get(pactId)
      if (remoteMemberKey) {
        if (!pact.isMember) {
          destroyPeerLink(link)
          continue
        }
        if (!(await pact.hasActiveMemberKey(remoteMemberKey))) {
          scheduleRevocationDisconnect(link, pact, pactId, remoteMemberKey, this._peerLinks)
          continue
        }
        clearRevocationTimer(link, pactId)
      } else if (pact.isMember) {
        const claimedMemberKey = link.claimedMembers.get(pactId)
        if (claimedMemberKey && (await pact.hasActiveMemberKey(claimedMemberKey))) {
          clearRevocationTimer(link, pactId)
          link.authenticatedMembers.set(pactId, claimedMemberKey)
          attachPactToLink(pact, link)
          this.emit('member-online', {
            pactId: pact.pactKey,
            alias: this._aliasForPactKey(pact.pactKey),
            member_key: claimedMemberKey,
          })
          continue
        }
        await this._requestMemberAuth(link, pact)
      }
    }
  }

  private _scheduleMemberAuth(link: PeerLink): void {
    for (const delayMs of [0, 250, 1000]) {
      setTimeout(() => {
        if (!this._peerLinks.has(link)) return
        for (const pact of this._pacts.values()) void this._requestMemberAuth(link, pact)
      }, delayMs)
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
  ): Promise<{ ok: true; nonce: string } | { ok: false; code: ErrorCode; message: string }> {
    if (this._peerLinks.size === 0) {
      return { ok: false, code: ERROR_CODES.NO_PEERS, message: 'no peers connected' }
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
            ? {
                ok: false,
                code: (last.code as ErrorCode | undefined) ?? ERROR_CODES.NO_INDEXER_REACHABLE,
                message: last.message || 'timeout',
              }
            : {
                ok: false,
                code: ERROR_CODES.NO_INDEXER_REACHABLE,
                message: 'no indexer responded',
              },
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
            code: (res.code as ErrorCode | undefined) ?? ERROR_CODES.INTERNAL,
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
          if (res.ok) {
            void this._bootstrapReplicationForAdmission(link, pactId, writerKey)
            return done(res)
          }
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
          code: ERROR_CODES.NO_INDEXER_REACHABLE,
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

  /**
   * Ordered shutdown sequence. Executed in this order:
   *   1. Stop announcing every pact topic so no new peers dial in.
   *   2. Cancel pending revocation timers (they hold ref'd timeouts).
   *   3. Destroy swarm (closes every peer socket).
   *   4. Close each pact (flushes autobase to disk).
   *   5. Clear in-memory maps and emit 'stop'.
   *
   * Earlier versions tore down the swarm before pact.close(), which
   * left autobase to try replicating over already-destroyed streams
   * — mostly harmless but produced noisy EBADF-style errors. The
   * new order guarantees pacts see a clean "no peers" state before
   * their cores close, and that close() has a chance to flush any
   * in-flight writes.
   */
  async stop(): Promise<void> {
    if (this._stopped) return
    this._stopped = true
    this._started = false

    // Stop announcing every pact topic. Best-effort: leave() can
    // fail if the swarm already tore down mid-shutdown.
    if (this._swarm) {
      for (const hex of this._joinedTopics) {
        try {
          await this._swarm.leave(b4a.from(hex, 'hex'))
        } catch {
          // non-fatal
        }
      }
    }
    this._joinedTopics.clear()

    // Cancel any revocation disconnect timers we queued so they
    // don't fire against a torn-down link.
    for (const link of this._peerLinks) {
      for (const timer of link.revocationTimers.values()) clearTimeout(timer)
      link.revocationTimers.clear()
    }

    // Destroy the swarm — this closes every peer socket, which in
    // turn triggers our conn.on('close') cleanup for each link.
    if (this._swarm) {
      try {
        await this._swarm.destroy()
      } catch {
        // non-fatal
      }
      this._swarm = null
    }
    this._peerLinks.clear()

    // Flush each pact to disk. Errors here are logged via the
    // caller's 'stop' listener; we still proceed to clear state so
    // a retried stop() doesn't deadlock on an already-closed pact.
    const closeErrors: Error[] = []
    for (const pact of this._pacts.values()) {
      try {
        await pact.close()
      } catch (err) {
        closeErrors.push(err as Error)
      }
    }
    this._pacts.clear()

    this.emit('stop')
    if (closeErrors.length) {
      this.emit('stop-error', { errors: closeErrors })
    }
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
  get isMember(): boolean {
    return this.current?.isMember ?? false
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

  /**
   * Member keys currently authenticated over a live peer link for the
   * given pact. Used by the /peers endpoint to report online status
   * without relying on autobase's activeWriters — autobase may have
   * GC'd a writer even while we hold an active, authenticated link to
   * them. Keys are lowercase hex.
   */
  onlineMembers(pactId: string): Set<string> {
    const out = new Set<string>()
    const hex = pactId.toLowerCase()
    for (const link of this._peerLinks) {
      const member = link.authenticatedMembers.get(hex)
      if (member) out.add(member.toLowerCase())
    }
    return out
  }

  private _aliasForPactKey(pactKey: string | null | undefined): string | undefined {
    if (!pactKey) return undefined
    const hex = pactKey.toLowerCase()
    for (const [alias, pact] of this._pacts) {
      if (pact.pactKey?.toLowerCase() === hex) return alias
    }
    return undefined
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

  /**
   * Open every pact from the registry. currentAlias (or first pact)
   * becomes current. An empty registry is fine — the host binds its
   * port and waits for `createPact` / `joinPact` calls to add one.
   */
  static async load(opts: DaemonOpts = {}): Promise<Daemon> {
    const d = new Daemon(opts)
    const cfg = await loadDaemonConfig(d.hostDir)
    for (const entry of cfg.pacts) {
      const pact = await Pact.load({ dataDir: entry.dataDir })
      d._pacts.set(entry.alias, pact)
      d._wireEvents(entry.alias, pact)
    }
    d._currentAlias = cfg.currentAlias ?? cfg.pacts[0]?.alias ?? null
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
