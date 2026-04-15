/*
 * Protomux-level wire protocol for forwarding invite redemptions to
 * indexer peers.
 *
 * Rationale: a joiner's daemon is a reader — it cannot append entries.
 * To promote the joiner to writer, some indexer on the swarm must
 * append the `invite-redeemed` + `admin.addWriter` pair. REST is
 * localhost-only so the joiner can't POST to the creator's daemon
 * directly. Instead, we piggyback a tiny request/response protocol on
 * the same Noise stream that Corestore uses for replication.
 *
 * Shape:
 *   channel protocol: 'openpact/invites/v1'
 *   message 0: redeem-request  {pactId, token, writerKey, corr}
 *   message 1: redeem-response {corr, ok, code?, message?, nonce?}
 *
 * `corr` is a correlation byte[] picked by the sender so it can match
 * responses to requests on a single multiplexed channel.
 */

import cenc from 'compact-encoding'

export const PROTOCOL = 'openpact/invites/v1'

export interface RedeemRequest {
  /** 64-hex discovery key identifying which pact the redeem is for. */
  pactId: string
  /** base64url invite token, as minted by POST /invites. */
  token: string
  /** 64-hex writer pubkey of the joiner (from their local Autobase core). */
  writerKey: string
  /** Opaque correlation token so the sender can match the response. */
  corr: Buffer
}

export interface RedeemResponse {
  corr: Buffer
  ok: boolean
  code?: string
  message?: string
  nonce?: string
}

/**
 * Compact-encoding for the redeem-request message. We encode strings
 * (ascii-safe hex + base64url + short error codes) directly, with
 * lengths prefixed by uint32.
 */
export const redeemRequestEnc: cenc.Encoding<RedeemRequest> = {
  preencode(state: { end: number }, m: RedeemRequest): void {
    cenc.string.preencode(state, m.pactId)
    cenc.string.preencode(state, m.token)
    cenc.string.preencode(state, m.writerKey)
    cenc.buffer.preencode(state, m.corr)
  },
  encode(state: { buffer: Buffer; start: number }, m: RedeemRequest): void {
    cenc.string.encode(state, m.pactId)
    cenc.string.encode(state, m.token)
    cenc.string.encode(state, m.writerKey)
    cenc.buffer.encode(state, m.corr)
  },
  decode(state: { buffer: Buffer; start: number; end: number }): RedeemRequest {
    return {
      pactId: cenc.string.decode(state),
      token: cenc.string.decode(state),
      writerKey: cenc.string.decode(state),
      corr: cenc.buffer.decode(state) as Buffer,
    }
  },
}

export const redeemResponseEnc: cenc.Encoding<RedeemResponse> = {
  preencode(state: { end: number }, m: RedeemResponse): void {
    cenc.buffer.preencode(state, m.corr)
    cenc.bool.preencode(state, m.ok)
    cenc.string.preencode(state, m.code || '')
    cenc.string.preencode(state, m.message || '')
    cenc.string.preencode(state, m.nonce || '')
  },
  encode(state: { buffer: Buffer; start: number }, m: RedeemResponse): void {
    cenc.buffer.encode(state, m.corr)
    cenc.bool.encode(state, m.ok)
    cenc.string.encode(state, m.code || '')
    cenc.string.encode(state, m.message || '')
    cenc.string.encode(state, m.nonce || '')
  },
  decode(state: { buffer: Buffer; start: number; end: number }): RedeemResponse {
    const corr = cenc.buffer.decode(state) as Buffer
    const ok = cenc.bool.decode(state) as boolean
    const code = cenc.string.decode(state) as string
    const message = cenc.string.decode(state) as string
    const nonce = cenc.string.decode(state) as string
    return {
      corr,
      ok,
      code: code || undefined,
      message: message || undefined,
      nonce: nonce || undefined,
    }
  },
}
