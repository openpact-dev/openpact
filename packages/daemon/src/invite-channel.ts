import {
  PROTOCOL,
  redeemRequestEnc,
  redeemResponseEnc,
  type RedeemRequest,
  type RedeemResponse,
} from './invite-wire'
import { corrKey, type PeerLink } from './peer-link'

/**
 * Daemon-supplied hooks for the invite Protomux channel:
 *   - `handleRedeemRequest`: map an incoming request to local state and
 *     return the response envelope. Surface daemon-level errors as
 *     RedeemResponse rather than throwing — a throw is translated into
 *     an INTERNAL response by the channel wiring.
 *   - `onAdmission`: called only when the response is `ok: true`.
 *     Used by the creator side to bootstrap replication of the newly
 *     admitted writer's core.
 */
export interface InviteChannelHandlers {
  handleRedeemRequest(req: RedeemRequest): Promise<RedeemResponse>
  onAdmission(link: PeerLink, pactId: string, writerKey: string): Promise<void>
}

/**
 * Wire the `openpact/invites/v1` channel onto `link`. Mutates the
 * link in place (sets `link.channel` and rebinds `sendRequest`) so
 * callers can keep a stable reference. If the peer didn't advertise
 * our protocol we leave `link.channel = null`; the caller's
 * redeemThroughPeers skips links in that state.
 */
export function openInviteChannel(link: PeerLink, mux: any, handlers: InviteChannelHandlers): void {
  let sendMsg: any = null
  const channel = mux.createChannel({
    protocol: PROTOCOL,
    onclose: () => {
      for (const resolve of link.pending.values()) {
        resolve({
          corr: Buffer.alloc(0),
          ok: false,
          code: 'AGENT_DISCONNECTED',
          message: 'agent disconnected before responding',
        })
      }
      link.pending.clear()
      // The member-auth channel shares link state; flushing its
      // pending map here too keeps behaviour identical to the
      // pre-split inline code path.
      for (const { resolve } of link.pendingAuth.values()) {
        resolve({
          corr: Buffer.alloc(0),
          ok: false,
          code: 'AGENT_DISCONNECTED',
          message: 'agent disconnected before responding',
        })
      }
      link.pendingAuth.clear()
    },
  })
  if (!channel) return

  const requestMsg = channel.addMessage({
    encoding: redeemRequestEnc,
    onmessage: (req: RedeemRequest) => {
      handlers
        .handleRedeemRequest(req)
        .then(async (res) => {
          if (res.ok) {
            await handlers.onAdmission(link, req.pactId, req.writerKey)
          }
          if (sendMsg) sendMsg.send({ ...res, corr: req.corr })
        })
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
    encoding: redeemResponseEnc,
    onmessage: (res: RedeemResponse) => {
      const key = corrKey(res.corr)
      const resolve = link.pending.get(key)
      if (resolve) {
        link.pending.delete(key)
        resolve(res)
      }
    },
  })
  sendMsg = responseMsg
  channel.open()
  link.channel = channel
  link.sendRequest = (req) => requestMsg.send(req)
}
