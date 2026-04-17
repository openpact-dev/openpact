import cenc from 'compact-encoding'

export const PROTOCOL = 'openpact/members/v1'

export interface MemberAuthRequest {
  pactId: string
  challenge: Buffer
  corr: Buffer
}

export interface MemberAuthResponse {
  corr: Buffer
  ok: boolean
  memberKey?: string
  signerKey?: string
  signerNamespace?: string
  compat?: boolean
  signature?: Buffer
  code?: string
  message?: string
}

/**
 * Application-level liveness ping. Both peers emit one every
 * `LIVENESS_INTERVAL_MS`; the responder echoes the same `corr` back
 * via `MemberAuthPong`. Ping/pong runs on the same Protomux channel
 * as the auth handshake so it proves the entire mux (not just the
 * underlying TCP/UDX stream) is moving bytes — the only signal that
 * survives a remote OS pausing the network stack mid-session.
 */
export interface MemberAuthPing {
  corr: Buffer
}

export interface MemberAuthPong {
  corr: Buffer
}

export const memberAuthRequestEnc: cenc.Encoding<MemberAuthRequest> = {
  preencode(state: { end: number }, m: MemberAuthRequest): void {
    cenc.string.preencode(state, m.pactId)
    cenc.buffer.preencode(state, m.challenge)
    cenc.buffer.preencode(state, m.corr)
  },
  encode(state: { buffer: Buffer; start: number }, m: MemberAuthRequest): void {
    cenc.string.encode(state, m.pactId)
    cenc.buffer.encode(state, m.challenge)
    cenc.buffer.encode(state, m.corr)
  },
  decode(state: { buffer: Buffer; start: number; end: number }): MemberAuthRequest {
    return {
      pactId: cenc.string.decode(state),
      challenge: cenc.buffer.decode(state) as Buffer,
      corr: cenc.buffer.decode(state) as Buffer,
    }
  },
}

export const memberAuthResponseEnc: cenc.Encoding<MemberAuthResponse> = {
  preencode(state: { end: number }, m: MemberAuthResponse): void {
    cenc.buffer.preencode(state, m.corr)
    cenc.bool.preencode(state, m.ok)
    cenc.string.preencode(state, m.memberKey || '')
    cenc.string.preencode(state, m.signerKey || '')
    cenc.string.preencode(state, m.signerNamespace || '')
    cenc.bool.preencode(state, m.compat === true)
    cenc.buffer.preencode(state, m.signature || Buffer.alloc(0))
    cenc.string.preencode(state, m.code || '')
    cenc.string.preencode(state, m.message || '')
  },
  encode(state: { buffer: Buffer; start: number }, m: MemberAuthResponse): void {
    cenc.buffer.encode(state, m.corr)
    cenc.bool.encode(state, m.ok)
    cenc.string.encode(state, m.memberKey || '')
    cenc.string.encode(state, m.signerKey || '')
    cenc.string.encode(state, m.signerNamespace || '')
    cenc.bool.encode(state, m.compat === true)
    cenc.buffer.encode(state, m.signature || Buffer.alloc(0))
    cenc.string.encode(state, m.code || '')
    cenc.string.encode(state, m.message || '')
  },
  decode(state: { buffer: Buffer; start: number; end: number }): MemberAuthResponse {
    const corr = cenc.buffer.decode(state) as Buffer
    const ok = cenc.bool.decode(state) as boolean
    const memberKey = cenc.string.decode(state) as string
    const signerKey = cenc.string.decode(state) as string
    const signerNamespace = cenc.string.decode(state) as string
    const compat = cenc.bool.decode(state) as boolean
    const signature = cenc.buffer.decode(state) as Buffer | null
    const code = cenc.string.decode(state) as string
    const message = cenc.string.decode(state) as string
    return {
      corr,
      ok,
      memberKey: memberKey || undefined,
      signerKey: signerKey || undefined,
      signerNamespace: signerNamespace || undefined,
      compat,
      signature: signature && signature.length > 0 ? signature : undefined,
      code: code || undefined,
      message: message || undefined,
    }
  },
}

export const memberAuthPingEnc: cenc.Encoding<MemberAuthPing> = {
  preencode(state: { end: number }, m: MemberAuthPing): void {
    cenc.buffer.preencode(state, m.corr)
  },
  encode(state: { buffer: Buffer; start: number }, m: MemberAuthPing): void {
    cenc.buffer.encode(state, m.corr)
  },
  decode(state: { buffer: Buffer; start: number; end: number }): MemberAuthPing {
    return { corr: cenc.buffer.decode(state) as Buffer }
  },
}

export const memberAuthPongEnc: cenc.Encoding<MemberAuthPong> = {
  preencode(state: { end: number }, m: MemberAuthPong): void {
    cenc.buffer.preencode(state, m.corr)
  },
  encode(state: { buffer: Buffer; start: number }, m: MemberAuthPong): void {
    cenc.buffer.encode(state, m.corr)
  },
  decode(state: { buffer: Buffer; start: number; end: number }): MemberAuthPong {
    return { corr: cenc.buffer.decode(state) as Buffer }
  },
}
