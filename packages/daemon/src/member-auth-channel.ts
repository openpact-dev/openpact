import crypto from 'crypto'
import {
  PROTOCOL,
  memberAuthRequestEnc,
  memberAuthResponseEnc,
  type MemberAuthRequest,
  type MemberAuthResponse,
} from './member-auth-wire'
import type { Pact } from './pact'
import { corrKey, attachPactToLink, clearRevocationTimer, type PeerLink } from './peer-link'

export interface MemberAuthChannelHandlers {
  handleMemberAuthRequest(req: MemberAuthRequest): Promise<MemberAuthResponse>
}

/** Wire the `openpact/member-auth/v1` channel onto `link`. */
export function openMemberAuthChannel(
  link: PeerLink,
  mux: any,
  handlers: MemberAuthChannelHandlers,
): void {
  let sendMsg: any = null
  const channel = mux.createChannel({
    protocol: PROTOCOL,
    onclose: () => {
      for (const { resolve } of link.pendingAuth.values()) {
        resolve({
          corr: Buffer.alloc(0),
          ok: false,
          code: 'PEER_DISCONNECTED',
          message: 'peer disconnected before responding',
        })
      }
      link.pendingAuth.clear()
    },
  })
  if (!channel) {
    link.authChannel = null
    link.sendAuthRequest = () => false
    return
  }

  const requestMsg = channel.addMessage({
    encoding: memberAuthRequestEnc,
    onmessage: (req: MemberAuthRequest) => {
      handlers
        .handleMemberAuthRequest(req)
        .then((res) => sendMsg && sendMsg.send({ ...res, corr: req.corr }))
        .catch(
          (err) =>
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
    encoding: memberAuthResponseEnc,
    onmessage: (res: MemberAuthResponse) => {
      const key = corrKey(res.corr)
      const pending = link.pendingAuth.get(key)
      if (!pending) return
      link.pendingAuth.delete(key)
      pending.resolve(res)
    },
  })
  sendMsg = responseMsg
  channel.open()
  link.authChannel = channel
  link.sendAuthRequest = (req) => requestMsg.send(req)
}

/**
 * Daemon-supplied hook invoked after a successful member-auth
 * exchange on a remote key that the local pact confirms is an
 * active member. The Daemon turns this into a `member-online`
 * event on its public EventEmitter.
 */
export interface MemberAuthContext {
  onMemberAuthenticated(pactKey: string, memberKey: string): void
}

/**
 * Initiate a member-auth challenge against `link` for `pact`. Skips
 * if we're not a member of this pact yet, if the channel hasn't
 * opened, if we already have an authenticated member for this pact
 * on this link, or if a pending auth is already outstanding.
 *
 * On success the link's claimed/authenticated maps are updated,
 * replication is attached, and the context's
 * `onMemberAuthenticated` hook fires exactly once per transition.
 */
export async function requestMemberAuth(
  link: PeerLink,
  pact: Pact,
  ctx: MemberAuthContext,
): Promise<void> {
  if (!pact.isMember || !link.authChannel) return
  const pactId = pact.pactKey?.toLowerCase()
  if (!pactId) return
  if (link.authenticatedMembers.has(pactId)) return
  for (const pending of link.pendingAuth.values()) {
    if (pending.pactId === pactId) return
  }

  const corr = crypto.randomBytes(8)
  const key = corrKey(corr)
  const challenge = crypto.randomBytes(32)
  const req: MemberAuthRequest = { pactId, challenge, corr }
  const response = new Promise<MemberAuthResponse>((resolve) => {
    link.pendingAuth.set(key, { pactId, challenge, resolve })
  })
  const sent = link.sendAuthRequest(req)
  if (!sent) {
    link.pendingAuth.delete(key)
    return
  }
  const res = await response
  if (!res.ok || !res.memberKey || !res.signerKey || !res.signature) return
  if (
    !pact.verifyMembershipChallenge(
      challenge,
      pactId,
      res.signature,
      res.memberKey,
      res.signerKey,
      res.signerNamespace,
      res.compat,
    )
  ) {
    return
  }
  const memberKey = res.memberKey.toLowerCase()
  link.claimedMembers.set(pactId, memberKey)
  if (!(await pact.hasActiveMemberKey(memberKey))) return
  clearRevocationTimer(link, pactId)
  const wasAuthed = link.authenticatedMembers.has(pactId)
  link.authenticatedMembers.set(pactId, memberKey)
  attachPactToLink(pact, link)
  if (!wasAuthed) {
    ctx.onMemberAuthenticated(pact.pactKey as string, memberKey)
  }
}
