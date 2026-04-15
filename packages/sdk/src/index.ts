import { OpenPactClient, type ClientOpts } from './client'
import { statusResource, type HostStatus } from './resources/status'
import { knowledgeResource } from './resources/knowledge'
import { tasksResource } from './resources/tasks'
import { skillsResource } from './resources/skills'
import { messagesResource } from './resources/messages'
import { adminResource } from './resources/admin'
import { entriesResource } from './resources/entries'
import { pactsResource } from './resources/pacts'
import { invitesResource } from './resources/invites'
import type { StatusPayload, PeerPayload } from './types'

/**
 * Top-level client. One instance is scoped to one pact — pass
 * `{ pactId: 'iron-compact' }` (or a 64-hex pactId) to the constructor
 * for every per-pact call. Host-level endpoints (`pacts.list` +
 * `ping`) work without a pactId so a single client can discover pacts
 * and then re-instantiate with the chosen one.
 */
export class OpenPact {
  private client: OpenPactClient
  private _status: ReturnType<typeof statusResource>

  knowledge: ReturnType<typeof knowledgeResource>
  tasks: ReturnType<typeof tasksResource>
  skills: ReturnType<typeof skillsResource>
  messages: ReturnType<typeof messagesResource>
  admin: ReturnType<typeof adminResource>
  entries: ReturnType<typeof entriesResource>
  pacts: ReturnType<typeof pactsResource>
  invites: ReturnType<typeof invitesResource>

  constructor(opts: ClientOpts = {}) {
    this.client = new OpenPactClient(opts)
    this._status = statusResource(this.client)
    this.knowledge = knowledgeResource(this.client)
    this.tasks = tasksResource(this.client)
    this.skills = skillsResource(this.client)
    this.messages = messagesResource(this.client)
    this.admin = adminResource(this.client)
    this.entries = entriesResource(this.client)
    this.pacts = pactsResource(this.client)
    this.invites = invitesResource(this.client)
  }

  /** Daemon health check. */
  ping(): Promise<{ ok: boolean }> {
    return this._status.ping()
  }

  /** Per-pact status (requires a pactId on the client). */
  status(): Promise<StatusPayload> {
    return this._status.get()
  }

  /** Host-level summary — current pact, total peer + pact counts. */
  hostStatus(): Promise<HostStatus> {
    return this._status.host()
  }

  /** Currently connected peers for this pact. */
  peers(): Promise<PeerPayload[]> {
    return this._status.peers()
  }

  /** Base URL the client is talking to (useful for diagnostics). */
  get baseUrl(): string {
    return this.client.baseUrl
  }

  /** The pactId this client is scoped to (null means only host endpoints are available). */
  get pactId(): string | null {
    return this.client.pactId
  }
}

export type { ClientOpts } from './client'
export type { HostStatus } from './resources/status'
export type { PactSummary, PactListPayload, CreatePactBody, JoinPactBody } from './resources/pacts'
export type {
  InviteSummary,
  MintInviteOpts,
  MintInviteResult,
} from './resources/invites'
export type {
  AppendResult,
  BaseEntry,
  EntryType,
  KnowledgeEntry,
  KnowledgePayload,
  ListOpts,
  ListPage,
  MessageEntry,
  MessagePayload,
  PeerPayload,
  SkillEntry,
  SkillFormat,
  SkillPayload,
  StatusPayload,
  TaskEntry,
  TaskPayload,
  TaskState,
  TaskStatus,
} from './types'
export {
  OpenPactError,
  DaemonNotRunningError,
  BadRequestError,
  BadCursorError,
  NotFoundError,
  TaskNotOpenError,
  TaskAlreadyClaimedError,
  TaskAlreadyCompleteError,
  NotClaimerError,
  NotClaimedError,
  NotAWriterError,
  SkillChecksumMismatchError,
  NotIndexerError,
  BadSkillNameError,
  NotConfirmedError,
  NotCreatorError,
  InviteBadShapeError,
  InviteWrongPactError,
  UnknownInviteError,
  InviteRevokedError,
  InviteSpentError,
  InviteNotIndexerError,
  InviteExpiredError,
  NoIndexerReachableError,
  DaemonError,
} from './errors'
