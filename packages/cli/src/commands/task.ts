import { Command } from 'commander'
import {
  OpenPact,
  DaemonNotRunningError,
  TaskNotOpenError,
  TaskAlreadyClaimedError,
  TaskAlreadyCompleteError,
  NotClaimerError,
  NotClaimedError,
  NotAssigneeError,
  NotFoundError,
} from '@openpact/sdk'
import type { TaskStatus, TaskState } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact, NoPactsError } from '../lib/pact-select'
import { c, emoji } from '../lib/theme'

interface BaseOpts {
  pact?: string
  port?: string | number
}

interface AddOpts extends BaseOpts {
  description?: string
  assignTo?: string
}

interface CompleteOpts extends BaseOpts {
  result?: string
}

interface ListOpts extends BaseOpts {
  status?: string
  limit?: string | number
}

const STATUSES: readonly TaskStatus[] = ['open', 'claimed', 'complete']

export function registerTaskCommand(parent: Command): void {
  const task = parent.command('task').description('manage tasks within the current pact')

  task
    .command('add <title>')
    .description('create a new task')
    .option('--description <text>', 'longer-form description of what needs doing')
    .option(
      '--assign-to <handle>',
      'reserve the task for one peer handle (only that agent can claim)',
    )
    .option('--pact <alias>', 'pact to write to (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action((title: string, opts: AddOpts, cmd: CmdLike) => taskAdd(title, opts, cmd))

  task
    .command('claim <id>')
    .description('claim an open task so other agents know you own it')
    .option('--pact <alias>', 'pact to write to (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action((id: string, opts: BaseOpts, cmd: CmdLike) => taskClaim(id, opts, cmd))

  task
    .command('complete <id>')
    .description('mark a task as complete')
    .option('--result <text>', 'short summary of what you did (e.g. "PR #123 merged")')
    .option('--pact <alias>', 'pact to write to (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action((id: string, opts: CompleteOpts, cmd: CmdLike) => taskComplete(id, opts, cmd))

  task
    .command('release <id>')
    .description('release a task you claimed; it returns to open')
    .option('--pact <alias>', 'pact to write to (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action((id: string, opts: BaseOpts, cmd: CmdLike) => taskRelease(id, opts, cmd))

  task
    .command('list')
    .description(
      'list tasks with typed formatting (use `openpact log --type task` for raw entries)',
    )
    .option('--status <s>', 'filter by status: open, claimed, complete')
    .option('--limit <n>', 'maximum tasks to print', '20')
    .option('--pact <alias>', 'pact to read (default: current pact)')
    .option('--port <n>', 'daemon port', '7666')
    .action((opts: ListOpts, cmd: CmdLike) => taskList(opts, cmd))
}

interface CmdLike {
  optsWithGlobals(): GlobalCliOpts
}

async function clientFor(opts: BaseOpts, cmd: CmdLike): Promise<OpenPact> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  let pactId: string
  try {
    pactId = await resolveCurrentPact(hostDir, opts.pact)
  } catch (err) {
    if (err instanceof NoPactsError) {
      console.error(`${emoji.cross} ${c.brand(err.message)}`)
      process.exit(1)
    }
    throw err
  }
  return new OpenPact({ port: Number(opts.port ?? 7666), pactId, hostDir })
}

const PEER_HANDLE_RE = /^anon-[a-z]+-[0-9a-f]{8}$/

async function taskAdd(title: string, opts: AddOpts, cmd: CmdLike): Promise<void> {
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (!trimmed) throw new Error('task title must not be empty')
  if (opts.assignTo !== undefined && !PEER_HANDLE_RE.test(opts.assignTo)) {
    throw new Error(
      `--assign-to expects a peer handle like anon-rat-12345678; got ${JSON.stringify(
        opts.assignTo,
      )}`,
    )
  }
  const client = await clientFor(opts, cmd)
  try {
    const res = await client.tasks.create({
      title: trimmed,
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.assignTo ? { assigned_to: opts.assignTo } : {}),
    })
    console.log(`  ${emoji.brand} ${c.brandBold('Task')} ${c.bone(res.id)} ${c.ash('created')}`)
    console.log(`  ${c.ash(res.timestamp)}`)
    console.log(`  ${c.ash(trimmed)}`)
    if (opts.assignTo) console.log(`  ${c.ash(`assigned to ${opts.assignTo}`)}`)
  } catch (err) {
    handleDaemonError(err)
  }
}

async function taskClaim(id: string, opts: BaseOpts, cmd: CmdLike): Promise<void> {
  const client = await clientFor(opts, cmd)
  try {
    const res = await client.tasks.claim(id)
    console.log(`  ${emoji.brand} ${c.brandBold('Claimed')} ${c.bone(res.id)}`)
    console.log(`  ${c.ash(res.title)}`)
  } catch (err) {
    if (err instanceof TaskNotOpenError || err instanceof TaskAlreadyClaimedError) {
      console.error(`${emoji.cross} ${c.brand('Task is already claimed by another agent.')}`)
      console.error(`  ${c.ash('Pick a different task or try again once released.')}`)
      process.exit(1)
    }
    if (err instanceof TaskAlreadyCompleteError) {
      console.error(`${emoji.cross} ${c.brand('Task is already complete.')}`)
      process.exit(1)
    }
    if (err instanceof NotAssigneeError) {
      console.error(`${emoji.cross} ${c.brand('Task is reserved for another peer.')}`)
      console.error(`  ${c.ash((err as Error).message)}`)
      process.exit(1)
    }
    if (err instanceof NotFoundError) {
      console.error(`${emoji.cross} ${c.brand(`No task with id ${id}.`)}`)
      process.exit(1)
    }
    handleDaemonError(err)
  }
}

async function taskComplete(id: string, opts: CompleteOpts, cmd: CmdLike): Promise<void> {
  const client = await clientFor(opts, cmd)
  try {
    const res = await client.tasks.complete(id, opts.result ? { result: opts.result } : {})
    console.log(`  ${emoji.brand} ${c.brandBold('Completed')} ${c.bone(res.id)}`)
    if (res.result) console.log(`  ${c.ash(res.result)}`)
  } catch (err) {
    if (err instanceof TaskAlreadyCompleteError) {
      console.error(`${emoji.cross} ${c.brand('Task is already complete.')}`)
      process.exit(1)
    }
    if (err instanceof NotClaimerError) {
      console.error(`${emoji.cross} ${c.brand('Only the claimer can complete this task.')}`)
      process.exit(1)
    }
    if (err instanceof NotFoundError) {
      console.error(`${emoji.cross} ${c.brand(`No task with id ${id}.`)}`)
      process.exit(1)
    }
    handleDaemonError(err)
  }
}

async function taskRelease(id: string, opts: BaseOpts, cmd: CmdLike): Promise<void> {
  const client = await clientFor(opts, cmd)
  try {
    const res = await client.tasks.release(id)
    console.log(`  ${emoji.brand} ${c.brandBold('Released')} ${c.bone(res.id)}`)
    console.log(`  ${c.ash(`status → ${res.status}`)}`)
  } catch (err) {
    if (err instanceof NotClaimerError || err instanceof NotClaimedError) {
      console.error(`${emoji.cross} ${c.brand('You do not hold the claim on this task.')}`)
      process.exit(1)
    }
    if (err instanceof NotFoundError) {
      console.error(`${emoji.cross} ${c.brand(`No task with id ${id}.`)}`)
      process.exit(1)
    }
    handleDaemonError(err)
  }
}

async function taskList(opts: ListOpts, cmd: CmdLike): Promise<void> {
  if (opts.status && !(STATUSES as readonly string[]).includes(opts.status)) {
    throw new Error(`unknown status: ${opts.status}. Allowed: ${STATUSES.join(', ')}`)
  }
  const client = await clientFor(opts, cmd)
  const limit = Number(opts.limit ?? 20)
  try {
    const page = await client.tasks.list({
      limit,
      order: 'desc',
      ...(opts.status ? { status: opts.status as TaskStatus } : {}),
    })
    if (page.entries.length === 0) {
      console.log(`  ${c.ash(opts.status ? `No ${opts.status} tasks.` : 'No tasks yet.')}`)
      return
    }
    for (const task of page.entries) {
      console.log('  ' + formatTask(task))
    }
  } catch (err) {
    handleDaemonError(err)
  }
}

function formatTask(task: TaskState): string {
  const status = task.status.padEnd(9)
  const id = c.ash(task.id)
  const title = c.bone(task.title)
  const owner = task.claimed_by ? ` ${c.ash(`← ${task.claimed_by}`)}` : ''
  const statusColoured =
    task.status === 'complete'
      ? c.spark(status)
      : task.status === 'claimed'
        ? c.ember(status)
        : c.bone(status)
  return `${statusColoured} ${id} ${title}${owner}`
}

function handleDaemonError(err: unknown): never {
  if (err instanceof DaemonNotRunningError) {
    console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
    process.exit(1)
  }
  throw err
}
