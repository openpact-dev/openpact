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
import { changesResource } from './resources/changes'
import type { StatusPayload, AgentPayload } from './types'

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
  changes: ReturnType<typeof changesResource>

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
    this.changes = changesResource(this.client)
  }

  /** Daemon health check. */
  ping(): Promise<{ ok: boolean }> {
    return this._status.ping()
  }

  /** Per-pact status (requires a pactId on the client). */
  status(): Promise<StatusPayload> {
    return this._status.get()
  }

  /** Host-level summary — current pact, total agent + pact counts. */
  hostStatus(): Promise<HostStatus> {
    return this._status.host()
  }

  /** Agents in this pact. Pass `{ online: true }` to restrict to live peers. */
  agents(opts: { online?: boolean } = {}): Promise<AgentPayload[]> {
    return this._status.agents(opts)
  }

  /** Base URL the client is talking to (useful for diagnostics). */
  get baseUrl(): string {
    return this.client.baseUrl
  }

  /** The pactId this client is scoped to (null means only host endpoints are available). */
  get pactId(): string | null {
    return this.client.pactId
  }

  /**
   * Retarget this client at a different pact. Resource helpers
   * (`knowledge`, `tasks`, ...) read the current pactId on every call,
   * so a switch takes effect immediately without re-instantiating.
   * Pass null to clear the scope and only use host-level endpoints.
   */
  setPactId(pactId: string | null): void {
    this.client.pactId = pactId
  }
}

export type { ClientOpts } from './client'
export type { HostStatus } from './resources/status'
export type { PactSummary, PactListPayload, CreatePactBody, JoinPactBody } from './resources/pacts'
export type { InviteSummary, MintInviteOpts, MintInviteResult } from './resources/invites'
export type { ChangesEntry, ChangesPage, PollOpts } from './resources/changes'
export { computeSkillChecksum, SKILL_CHECKSUM_LABEL } from './resources/skills'
export type {
  BaseEntry,
  EntryType,
  KnowledgeEntry,
  KnowledgePayload,
  ListOpts,
  ListPage,
  MessageEntry,
  MessagePayload,
  AgentPayload,
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
  NotAssigneeError,
  NotAMemberError,
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
  UnauthorizedError,
  BadEntryError,
  PayloadTooLargeError,
  ViewTimeoutError,
  RateLimitedError,
  DaemonError,
} from './errors'
export { ERROR_CODES, type ErrorCode } from './error-codes'
