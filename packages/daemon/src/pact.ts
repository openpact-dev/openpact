import EventEmitter from 'events'
import b4a from 'b4a'
import Corestore from 'corestore'
import Autobase from 'autobase'
import Hypercore from 'hypercore'
import Hyperbee from 'hyperbee'
import crypto from 'hypercore-crypto'

import { pactStorePath } from './data-dir'
import { loadPactConfig, savePactConfig, type Role, type PactConfig } from './config'
import {
  AGENT_NAME_PREFIX,
  INDEXER_PREFIX,
  makeApply,
  INVITE_PREFIX,
  MEMBER_PREFIX,
  PACT_NAME_KEY,
  PACT_PURPOSE_KEY,
} from './apply'
import * as peerHandle from './peer-handle'
import * as entryId from './entry-id'
import * as invites from './invites'
import { validate as validateEntry, MAX_PAYLOAD_BYTES } from './schemas'
import { DEFAULT_TTL_MS, InviteDecodeError, type Invite, type InviteSummary } from './invites'

/**
 * Thrown by {@link Pact.append} when an entry fails schema / size
 * validation *before* anything reaches the Hypercore log. Routes can
 * map this to a 400 with a specific error code rather than letting it
 * bubble as a generic 500.
 */
export class EntryValidationError extends Error {
  reason: 'not-an-object' | 'unknown-type' | 'schema' | 'payload-too-large'
  details: unknown

  constructor(
    reason: 'not-an-object' | 'unknown-type' | 'schema' | 'payload-too-large',
    details?: unknown,
  ) {
    super(`entry validation failed: ${reason}`)
    this.name = 'EntryValidationError'
    this.reason = reason
    this.details = details ?? null
  }
}

export { MAX_PAYLOAD_BYTES }

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

  /** Join an existing pact by its hex key. Writes config.json without membership. */
  static async join(opts: PactJoinOpts): Promise<Pact> {
    if (!opts.joinKey) throw new Error('joinKey is required to join an existing pact')
    const p = new Pact(opts)
    await p._initStore()
    const bootstrap = b4a.from(opts.joinKey, 'hex')
    p._base = new Autobase(p._store, bootstrap, p._autobaseOpts())
    await p._base.ready()
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
    p._role = cfg.role === 'creator' ? 'creator' : null
    p._pactName = opts.pactName ?? cfg.pactName ?? null
    p._pactPurpose = opts.pactPurpose ?? cfg.pactPurpose ?? null
    p._displayName = opts.displayName ?? cfg.displayName ?? null
    // View-synced metadata wins over local config; for a pact that
    // was offline while another peer renamed it, this is where we
    // surface the update.
    await p._seedPactMetaFromView()
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
        onApplied: (info) => {
          this._onAppliedInternal(info)
          this.emit('entry-applied', info)
        },
      }),
    }
  }

  /**
   * Internal apply side-effects that belong to the Pact itself rather
   * than to consumers. Today: keep `_pactName` / `_pactPurpose` in sync
   * with any `admin.setInfo` entry that reaches the view, so every
   * peer's getters reflect the ledger-synced value. We also persist
   * to config.json so a restart without fresh replication still shows
   * the last-known value.
   */
  private _onAppliedInternal(info: { kind: string; entry: unknown }): void {
    if (info.kind !== 'admin') return
    const e = info.entry as { payload?: { action?: string; name?: unknown; purpose?: unknown } }
    if (e?.payload?.action !== 'setInfo') return
    let changed = false
    if ('name' in (e.payload as object)) {
      const next =
        typeof e.payload.name === 'string' ? e.payload.name : e.payload.name === null ? null : null
      if (next !== this._pactName) {
        this._pactName = next
        changed = true
      }
    }
    if ('purpose' in (e.payload as object)) {
      const next =
        typeof e.payload.purpose === 'string'
          ? e.payload.purpose
          : e.payload.purpose === null
            ? null
            : null
      if (next !== this._pactPurpose) {
        this._pactPurpose = next
        changed = true
      }
    }
    if (changed) void this._persistConfig()
  }

  /**
   * Re-seed `_pactName` / `_pactPurpose` from the Hyperbee view.
   * Called on Pact.load so a daemon that was offline while a peer
   * renamed the pact surfaces the synced value on next boot.
   */
  private async _seedPactMetaFromView(): Promise<void> {
    const v = this._base?.view
    if (!v) return
    try {
      const [nameRow, purposeRow] = await Promise.all([
        v.get(PACT_NAME_KEY),
        v.get(PACT_PURPOSE_KEY),
      ])
      const nameVal = nameRow?.value
      if (nameVal && typeof nameVal === 'object' && 'value' in nameVal) {
        const n = (nameVal as { value: unknown }).value
        if (typeof n === 'string' || n === null) this._pactName = n
      }
      const purposeVal = purposeRow?.value
      if (purposeVal && typeof purposeVal === 'object' && 'value' in purposeVal) {
        const p = (purposeVal as { value: unknown }).value
        if (typeof p === 'string' || p === null) this._pactPurpose = p
      }
    } catch {
      // View might not be ready yet on brand-new pacts or on join before
      // the first admin entry lands. Local config stays authoritative
      // until the next entry-applied event refreshes us.
    }
  }

  private async _persistConfig(): Promise<void> {
    const cfg = await loadPactConfig(this.dataDir)
    cfg.pactKey = b4a.toString(this._base.key, 'hex')
    cfg.role = this.role
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
    if (this._role === 'creator') return 'creator'
    if (this.isIndexer) return 'indexer'
    if (this.isMember) return 'member'
    return null
  }

  get isWriter(): boolean {
    return this._base ? !!this._base.writable : false
  }

  get isMember(): boolean {
    return this.isWriter
  }

  get isIndexer(): boolean {
    return this._base ? !!this._base.isIndexer : false
  }

  get viewVersion(): number {
    return this._base && this._base.view ? (this._base.view.version as number) : 0
  }

  /**
   * Update pact name and/or purpose. On a writable pact this appends
   * an `admin.setInfo` entry so every peer converges on the same
   * value — the Pact's own `entry-applied` handler then writes the
   * result back into `_pactName` / `_pactPurpose` and persists config.
   *
   * When the pact isn't writable yet (reader joining pre-admission),
   * we fall back to updating local state only — an agent can't
   * announce a name until they're an admitted writer, and apply.ts
   * would reject the entry anyway because `admin` requires indexer
   * authority. Local state keeps the dashboard responsive and is
   * overwritten the moment a synced entry lands.
   *
   * Empty/whitespace input is normalised to null so "" and "   " and
   * "clear it" all land as the same explicit clear.
   */
  async setPactInfo({
    name,
    purpose,
  }: {
    name?: string | null
    purpose?: string | null
  }): Promise<void> {
    const norm = (v: string | null | undefined): string | null | undefined => {
      if (v === undefined) return undefined
      if (v === null) return null
      const t = v.trim()
      return t === '' ? null : t
    }
    const nextName = norm(name)
    const nextPurpose = norm(purpose)

    if (this._base?.writable) {
      const payload: { action: 'setInfo'; name?: string | null; purpose?: string | null } = {
        action: 'setInfo',
      }
      if (nextName !== undefined) payload.name = nextName
      if (nextPurpose !== undefined) payload.purpose = nextPurpose
      // Nothing to do — caller passed neither field.
      if (!('name' in payload) && !('purpose' in payload)) return

      // Capture the current (pre-change) values so the announce message
      // below can narrate the transition. We deliberately skip the
      // announce + admin append when nothing actually changed from the
      // caller's POV — clicking Save with unchanged fields shouldn't
      // spam the feed.
      const prevName = this._pactName
      const prevPurpose = this._pactPurpose
      const nameChanged = 'name' in payload && (payload.name ?? null) !== prevName
      const purposeChanged = 'purpose' in payload && (payload.purpose ?? null) !== prevPurpose
      if (!nameChanged && !purposeChanged) return

      await this.append({
        type: 'admin',
        timestamp: new Date().toISOString(),
        agent_id: this.peerHandle as string,
        display_name: this._displayName,
        payload,
      })
      // Announce the update as a `message` so it lands in every peer's
      // activity feed just like a display-name rename or a join. The
      // message carries the structured before/after fields so a future
      // dashboard affordance can render them without re-parsing content.
      await this._announcePactInfoChange({
        prevName,
        nextName: nameChanged ? (payload.name ?? null) : prevName,
        prevPurpose,
        nextPurpose: purposeChanged ? (payload.purpose ?? null) : prevPurpose,
        nameChanged,
        purposeChanged,
      })
      // The entry-applied hook mirrors these writes back into our
      // local fields once apply() runs; a short race window may
      // exist where a reader of `pact.pactName` sees the pre-append
      // value. That's acceptable — the next event-applied event
      // refreshes the getters.
      return
    }

    // Pre-writable fallback. Local only. Will be overridden by the
    // first admin.setInfo entry we apply from a peer.
    if (nextName !== undefined) this._pactName = nextName
    if (nextPurpose !== undefined) this._pactPurpose = nextPurpose
    await this._persistConfig()
  }

  async setDisplayName(name: string | null): Promise<void> {
    const prev = this._displayName
    const next = name || null
    this._displayName = next
    await this._persistConfig()
    // Only writers can append. A non-writing (reader) peer changing
    // their local config is legitimate — they just can't announce it
    // until they're admitted as a member.
    if (next && this._base?.writable) {
      await this._announceDisplayName(next, prev)
    }
  }

  /** Guard: suppress re-entrant auto-heal while an append is in flight.
   * Without this, an autobase `update` event fired mid-append would
   * re-enter `announceDisplayNameIfStale`, re-read a still-stale view,
   * and append a duplicate rename. */
  private _announcing = false

  /**
   * If our advertised display_name isn't indexed at `_agents/<self>` (or
   * the indexed name is stale), emit one rename message so peers learn
   * the current value. Idempotent and cheap: a single view lookup plus
   * an append only when something actually differs. Called from the
   * daemon on 'writable' so joiners self-heal after admission, and on
   * pact open so pre-upgrade pacts get their index populated the first
   * time this code runs.
   */
  async announceDisplayNameIfStale(): Promise<void> {
    // Guard must flip BEFORE any await, otherwise the autobase 'update'
    // that fires mid-view.get can re-enter here with the index still
    // stale, and both callers end up appending a second rename message.
    if (this._announcing) return
    if (!this._base?.writable) return
    const current = this._displayName
    if (!current) return
    const handle = this.peerHandle
    if (!handle) return
    this._announcing = true
    try {
      const existing = await this.view?.get?.(`${AGENT_NAME_PREFIX}${handle}`)
      const existingName =
        existing && typeof existing.value === 'object' && existing.value
          ? ((existing.value as { name?: unknown }).name as string | undefined)
          : undefined
      if (existingName === current) return
      await this._announceDisplayName(current, existingName ?? null)
    } catch {
      // Best-effort auto-heal. Autobase/hypercore can reject the append
      // when the pact is mid-close (init-in-process creates-then-stops)
      // or before the view is fully ready. Future writes will republish
      // on the next writable/update tick.
    } finally {
      this._announcing = false
    }
  }

  private async _announceDisplayName(next: string, prev: string | null): Promise<void> {
    // prev === null covers the first self-heal for this writer — i.e.
    // the peer's _agents/<self> wasn't indexed before, which from every
    // other agent's POV reads as "they just joined". An actual rename
    // (prev is set) narrates the transition.
    const content = prev ? `${prev} is now known as ${next}.` : `${next} joined the pact.`
    await this.append({
      type: 'message',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle,
      display_name: next,
      payload: {
        content,
        kind: 'rename',
        prev,
        next,
      },
    })
  }

  /**
   * Broadcast a pact-update message after a successful
   * {@link setPactInfo}. Mirrors `_announceDisplayName` — a single
   * `message` entry so the existing activity feed / toast plumbing on
   * every peer picks it up without any special-casing. The structured
   * payload fields (`kind`, `prev_name`, `next_name`, …) let a future
   * UI render richer affordances without re-parsing the content string.
   *
   * Content is author-friendly first, English second:
   *   - name-only change → "Salt renamed the pact from 'X' to 'Y'."
   *   - purpose-only     → "Salt updated the pact purpose."
   *   - both at once     → "Salt updated the pact."
   */
  private async _announcePactInfoChange(opts: {
    prevName: string | null
    nextName: string | null
    prevPurpose: string | null
    nextPurpose: string | null
    nameChanged: boolean
    purposeChanged: boolean
  }): Promise<void> {
    const actor = this._displayName ?? this.peerHandle ?? 'Someone'
    let content: string
    if (opts.nameChanged && !opts.purposeChanged) {
      const from = opts.prevName ? `'${opts.prevName}'` : '(unnamed)'
      const to = opts.nextName ? `'${opts.nextName}'` : '(unnamed)'
      content = `${actor} renamed the pact from ${from} to ${to}.`
    } else if (!opts.nameChanged && opts.purposeChanged) {
      content = opts.nextPurpose
        ? `${actor} updated the pact purpose.`
        : `${actor} cleared the pact purpose.`
    } else {
      content = `${actor} updated the pact.`
    }
    await this.append({
      type: 'message',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle as string,
      display_name: this._displayName,
      payload: {
        content,
        kind: 'pact-update',
        prev_name: opts.prevName,
        next_name: opts.nextName,
        prev_purpose: opts.prevPurpose,
        next_purpose: opts.nextPurpose,
      },
    })
  }

  async append(entry: Record<string, unknown>): Promise<{ id: string; timestamp: string }> {
    if (!this._base.writable) throw new Error('this peer is not a member of the pact')
    // Validate before we touch Autobase. An oversized or schema-invalid
    // entry appended here would still be rejected by apply() later, but
    // the local Hypercore would have already grown. Pre-validating
    // means the caller gets a clear error and the log stays clean.
    const result = validateEntry(entry)
    if (!result.valid) {
      throw new EntryValidationError(result.reason, result)
    }
    await this._base.append(entry)
    const seq = this._base.local.length
    const id = entryId.encode({ writerKey: this._base.local.key, seq })
    return { id, timestamp: entry.timestamp as string }
  }

  // ──────────────────────────────────────────────────────────────────
  // Invite tokens
  // ──────────────────────────────────────────────────────────────────

  /**
   * Serialised per-pact lock that protects createInvite / revokeInvite /
   * redeemInvite from each other. Two concurrent redeem attempts for the
   * same nonce must not both pass the unspent check and both append
   * entries — we want only one invite-redeemed + admin pair per token.
   * The apply-level `_invites/<nonce>` guard is the ultimate authority,
   * but this lock keeps us from emitting orphan admin entries.
   */
  private _inviteLock: Promise<void> = Promise.resolve()
  private async _withInviteLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this._inviteLock
    let release: () => void = () => {}
    this._inviteLock = new Promise<void>((r) => {
      release = r
    })
    try {
      await prev
      return await fn()
    } finally {
      release()
    }
  }

  /** Mint a fresh one-time invite token, persisted to invites.json. */
  async createInvite(opts: { ttlMs?: number } = {}): Promise<{
    token: string
    invite: Invite
  }> {
    if (!this.pactKey) throw new Error('pact is not open')
    const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
    const now = Date.now()
    const invite: Invite = {
      nonce: invites.newNonce(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      createdAt: new Date(now).toISOString(),
      ttlMs,
      pactName: this._pactName,
      issuerDisplay: this._displayName,
      revoked: false,
      revokedAt: null,
      spentAt: null,
      spentBy: null,
    }
    const token = invites.encodeToken({
      v: 1,
      pactId: this.pactKey,
      nonce: invite.nonce,
      expiresAt: invite.expiresAt,
      pactName: this._pactName,
      pactPurpose: this._pactPurpose,
      issuerDisplay: this._displayName,
    })
    await this._withInviteLock(async () => {
      const file = await invites.loadInvites(this.dataDir)
      file.invites.push(invite)
      await invites.saveInvites(this.dataDir, file)
    })
    return { token, invite }
  }

  /** Read invites.json and return a UI-ready summary list. */
  async listInvites(): Promise<InviteSummary[]> {
    const file = await invites.loadInvites(this.dataDir)
    const now = Date.now()
    return file.invites.map((inv) => invites.summarise(inv, now))
  }

  /** Mark an invite as revoked. Local to this daemon (phase 1). */
  async revokeInvite(nonce: string): Promise<void> {
    await this._withInviteLock(async () => {
      const file = await invites.loadInvites(this.dataDir)
      const entry = file.invites.find((inv) => inv.nonce === nonce)
      if (!entry) throw new Error(`no invite with nonce ${nonce}`)
      if (entry.revoked) return
      entry.revoked = true
      entry.revokedAt = new Date().toISOString()
      await invites.saveInvites(this.dataDir, file)
    })
  }

  /**
   * Redeem a token on behalf of a new writer. Appends an
   * `invite-redeemed` entry followed by `admin.addWriter`, so the pair
   * confirms together on the next frontier. The caller (REST handler
   * or protomux receiver) is expected to be running on an indexer
   * daemon — we verify that here and throw if not.
   *
   * On success, marks the nonce spent in the local invites.json. Any
   * future attempt on the same nonce hits either the local-file check
   * (same daemon) or the apply-level `_invites/<nonce>` guard (if a
   * second indexer ever became capable of redeeming).
   */
  async redeemInvite(token: string, writerKeyHex: string): Promise<{ nonce: string }> {
    if (!this._base || !this.pactKey) throw new Error('pact is not open')
    if (!/^[0-9a-f]{64}$/i.test(writerKeyHex)) {
      throw new invites.RedeemError('INVITE_BAD_SHAPE', 'member key must be 64-hex', 400)
    }
    let payload: invites.InviteTokenPayload
    try {
      payload = invites.decodeToken(token)
    } catch (e) {
      if (e instanceof InviteDecodeError) {
        throw new invites.RedeemError('INVITE_BAD_SHAPE', e.message, 400)
      }
      throw e
    }
    if (payload.pactId.toLowerCase() !== this.pactKey.toLowerCase()) {
      throw new invites.RedeemError(
        'INVITE_WRONG_PACT',
        'token pactId does not match this pact',
        400,
      )
    }
    if (!this._base.isIndexer) {
      throw new invites.RedeemError(
        'INVITE_NOT_INDEXER',
        'this daemon is not an indexer for the pact — forward the request to an indexer',
        409,
      )
    }

    return this._withInviteLock(async () => {
      const file = await invites.loadInvites(this.dataDir)
      const entry = file.invites.find((inv) => inv.nonce === payload.nonce)
      if (!entry) {
        throw new invites.RedeemError('UNKNOWN_INVITE', 'unknown invite', 404)
      }
      if (entry.revoked) {
        throw new invites.RedeemError('INVITE_REVOKED', 'invite has been revoked', 409)
      }
      if (entry.spentAt) {
        throw new invites.RedeemError('INVITE_SPENT', 'invite has already been redeemed', 409)
      }
      if (Date.parse(entry.expiresAt) <= Date.now()) {
        throw new invites.RedeemError('INVITE_EXPIRED', 'invite has expired', 410)
      }
      const existing = await this.view.get(`${INVITE_PREFIX}${payload.nonce}`)
      if (existing) {
        // Pre-empt apply-time rejection so we never emit an orphan
        // admin.addWriter against an already-spent nonce. Shouldn't
        // happen in the current creator-only MVP; guards the future
        // multi-indexer path.
        throw new invites.RedeemError('INVITE_SPENT', 'invite has already been redeemed', 409)
      }

      const ts = new Date().toISOString()
      await this._base.append({
        type: 'invite-redeemed',
        timestamp: ts,
        agent_id: this.peerHandle,
        display_name: this.displayName,
        payload: { nonce: payload.nonce, redeemed_by: writerKeyHex.toLowerCase() },
      })
      await this._base.append({
        type: 'admin',
        timestamp: ts,
        agent_id: this.peerHandle,
        display_name: this.displayName,
        payload: {
          action: 'addWriter',
          key: writerKeyHex.toLowerCase(),
          indexer: false,
        },
      })

      // Mark locally spent so `invite --list` reflects reality
      // immediately, without waiting for apply to catch up.
      entry.spentAt = ts
      entry.spentBy = writerKeyHex.toLowerCase()
      await invites.saveInvites(this.dataDir, file)
      return { nonce: payload.nonce }
    })
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

  /**
   * Append a self-targeted `admin.removeWriter` so this peer relinquishes
   * its writer rights on the pact. apply.ts has a carve-out allowing
   * self-revocation without indexer authority; used when a peer leaves
   * a pact locally so remote peers can drop it from their writer set.
   *
   * Short-circuits for the sole-indexer case: autobase refuses to remove
   * the last indexer (apply-calls.js throws synchronously inside the
   * reducer, which the caller's try/catch can't trap), and a self-
   * revocation from a one-peer pact is meaningless anyway — there's
   * nobody left to notice. Callers get `false` back so they can skip
   * the "let peers catch up" grace window.
   */
  async leaveAsWriter(): Promise<boolean> {
    if (!this._base || !this._base.writable) return false
    const keyHex = this.publicKey
    if (!keyHex) return false
    if (await this._isSoleIndexer()) return false
    await this._base.append({
      type: 'admin',
      timestamp: new Date().toISOString(),
      agent_id: this.peerHandle,
      display_name: this.displayName,
      payload: { action: 'removeWriter', key: keyHex },
    })
    return true
  }

  /**
   * True when this peer is an indexer AND the only indexer on the
   * pact's view. Used to avoid an autobase crash on the removeWriter
   * path for solo pacts.
   */
  private async _isSoleIndexer(): Promise<boolean> {
    const view = this.view
    const ourKey = this.publicKey
    if (!view || !ourKey) return false
    const range = { gte: INDEXER_PREFIX, lt: INDEXER_PREFIX + '\uffff' }
    const found: string[] = []
    try {
      const stream = view.createReadStream(range)
      for await (const { key } of stream as AsyncIterable<{ key: string }>) {
        found.push(key.slice(INDEXER_PREFIX.length))
        if (found.length > 1) return false
      }
    } catch {
      return false
    }
    return found.length === 1 && found[0] === ourKey
  }

  async hasActiveMemberKey(keyHex: string): Promise<boolean> {
    const target = keyHex.toLowerCase()
    const member = await this.view?.get?.(`${MEMBER_PREFIX}${target}`)
    return member != null
  }

  signMembershipChallenge(
    challenge: Buffer,
    pactId: string,
  ): {
    memberKey: string
    signerKey: string
    signerNamespace?: string
    compat: boolean
    signature: Buffer
  } {
    if (!this._base) {
      throw new Error('pact is not open')
    }
    const keyPair = this._base.local?.keyPair
    const memberKey = this.publicKey
    const signerKey = keyPair?.publicKey
    const signerNamespace = this._base.local?.manifest?.signers?.[0]?.namespace
    const compat = !!this._base.local?.core?.compat
    if (!keyPair?.secretKey || !signerKey || !memberKey) {
      throw new Error('local member keypair is unavailable')
    }
    const message = membershipChallengeMessage(pactId, challenge)
    return {
      memberKey,
      signerKey: b4a.toString(signerKey, 'hex') as string,
      signerNamespace: signerNamespace
        ? (b4a.toString(signerNamespace, 'hex') as string)
        : undefined,
      compat,
      signature: crypto.sign(message, keyPair.secretKey),
    }
  }

  verifyMembershipChallenge(
    challenge: Buffer,
    pactId: string,
    signature: Buffer,
    memberKey: string,
    signerKey: string,
    signerNamespace?: string,
    compat = false,
  ): boolean {
    if (!/^[0-9a-f]{64}$/i.test(memberKey) || !/^[0-9a-f]{64}$/i.test(signerKey)) return false
    const message = membershipChallengeMessage(pactId, challenge)
    if (!crypto.verify(message, signature, b4a.from(signerKey, 'hex'))) return false
    const derivedKey = Hypercore.key(
      {
        version: 1,
        hash: 'blake2b',
        allowPatch: false,
        quorum: 1,
        signers: [
          {
            publicKey: b4a.from(signerKey, 'hex'),
            namespace: signerNamespace ? b4a.from(signerNamespace, 'hex') : undefined,
          },
        ],
        prologue: null,
        linked: null,
        userData: null,
      },
      { compat },
    )
    return b4a.toString(derivedKey, 'hex').toLowerCase() === memberKey.toLowerCase()
  }

  async waitForMemberRemoval(keyHex: string, opts: { timeout?: number } = {}): Promise<void> {
    const timeout = opts.timeout ?? 5000
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (!(await this.hasActiveMemberKey(keyHex))) return
      await this.update()
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`waitForMemberRemoval timeout for ${keyHex}`)
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

function membershipChallengeMessage(pactId: string, challenge: Buffer): Buffer {
  return b4a.concat([
    b4a.from('openpact-member-auth-v1', 'utf8'),
    b4a.from(pactId.toLowerCase(), 'utf8'),
    challenge,
  ]) as Buffer
}
