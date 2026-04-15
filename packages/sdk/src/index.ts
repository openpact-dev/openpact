import { OpenPactClient, type ClientOpts } from './client'
import { statusResource } from './resources/status'
import { knowledgeResource } from './resources/knowledge'
import { tasksResource } from './resources/tasks'
import { skillsResource } from './resources/skills'
import { messagesResource } from './resources/messages'
import { adminResource } from './resources/admin'
import type { StatusPayload, PeerPayload } from './types'

export class OpenPact {
  private client: OpenPactClient

  knowledge: ReturnType<typeof knowledgeResource>
  tasks: ReturnType<typeof tasksResource>
  skills: ReturnType<typeof skillsResource>
  messages: ReturnType<typeof messagesResource>
  admin: ReturnType<typeof adminResource>

  constructor(opts: ClientOpts = {}) {
    this.client = new OpenPactClient(opts)
    const status = statusResource(this.client)
    this._status = status
    this.knowledge = knowledgeResource(this.client)
    this.tasks = tasksResource(this.client)
    this.skills = skillsResource(this.client)
    this.messages = messagesResource(this.client)
    this.admin = adminResource(this.client)
  }

  private _status: ReturnType<typeof statusResource>

  /** Daemon health check. */
  ping(): Promise<{ ok: boolean }> {
    return this._status.ping()
  }

  /** Pact status: id, peers, entry count, role flags. */
  status(): Promise<StatusPayload> {
    return this._status.get()
  }

  /** Currently connected peers. */
  peers(): Promise<PeerPayload[]> {
    return this._status.peers()
  }

  /** Base URL the client is talking to (useful for diagnostics). */
  get baseUrl(): string {
    return this.client.baseUrl
  }
}

export type { ClientOpts } from './client'
export type {
  AppendResult,
  BaseEntry,
  EntryType,
  KnowledgeEntry,
  KnowledgePayload,
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
  NotFoundError,
  TaskNotOpenError,
  TaskAlreadyClaimedError,
  TaskAlreadyCompleteError,
  NotClaimerError,
  NotClaimedError,
  NotAWriterError,
  SkillChecksumMismatchError,
  DaemonError,
} from './errors'
