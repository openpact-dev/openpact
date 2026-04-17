import test from 'brittle'
import { runWithDir } from './helpers/run-cli'
import { bootPact, extractTaskId } from './helpers/boot-pact'

test('task: add → list → claim → complete lifecycle', async (t) => {
  const { home, port } = await bootPact(t)

  const add = await runWithDir(
    home,
    [
      'task',
      'add',
      'Migrate auth middleware',
      '--description',
      'long form',
      '--port',
      String(port),
    ],
    { reject: true },
  )
  t.is(add.exitCode, 0)
  t.ok(add.stdout.includes('Task'))
  const taskId = extractTaskId(add.stdout)
  t.ok(taskId, 'task id printed')

  // Wait for view to populate.
  await new Promise((r) => setTimeout(r, 400))

  const list = await runWithDir(
    home,
    ['task', 'list', '--status', 'open', '--port', String(port)],
    {
      reject: true,
    },
  )
  t.is(list.exitCode, 0)
  t.ok(list.stdout.includes('Migrate auth middleware'))
  t.ok(list.stdout.includes('open'))

  const claim = await runWithDir(home, ['task', 'claim', taskId, '--port', String(port)], {
    reject: true,
  })
  t.is(claim.exitCode, 0)
  t.ok(claim.stdout.includes('Claimed'))

  const complete = await runWithDir(
    home,
    ['task', 'complete', taskId, '--result', 'PR #123 merged', '--port', String(port)],
    { reject: true },
  )
  t.is(complete.exitCode, 0)
  t.ok(complete.stdout.includes('Completed'))
  t.ok(complete.stdout.includes('PR #123 merged'))
})

test('task: claiming an already-claimed task surfaces a typed error', async (t) => {
  const { home, port } = await bootPact(t)
  const add = await runWithDir(home, ['task', 'add', 'Once', '--port', String(port)], {
    reject: true,
  })
  const id = extractTaskId(add.stdout)
  await new Promise((r) => setTimeout(r, 300))
  await runWithDir(home, ['task', 'claim', id, '--port', String(port)], { reject: true })

  // Re-claim must refuse with a clear error.
  const second = await runWithDir(home, ['task', 'claim', id, '--port', String(port)])
  t.not(second.exitCode, 0)
  t.ok(second.stderr.includes('already claimed'))
})

test('task: list with no tasks renders empty-state message', async (t) => {
  const { home, port } = await bootPact(t)
  const res = await runWithDir(home, ['task', 'list', '--port', String(port)], { reject: true })
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('No tasks yet'))
})

test('task list: rejects unknown status', async (t) => {
  const { home, port } = await bootPact(t)
  const res = await runWithDir(home, ['task', 'list', '--status', 'bogus', '--port', String(port)])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('unknown status'))
})

test('task: release returns a claimed task to open', async (t) => {
  const { home, port } = await bootPact(t)
  const add = await runWithDir(home, ['task', 'add', 'toRelease', '--port', String(port)], {
    reject: true,
  })
  const id = extractTaskId(add.stdout)
  await new Promise((r) => setTimeout(r, 300))
  await runWithDir(home, ['task', 'claim', id, '--port', String(port)], { reject: true })

  const release = await runWithDir(home, ['task', 'release', id, '--port', String(port)], {
    reject: true,
  })
  t.is(release.exitCode, 0)
  t.ok(release.stdout.includes('Released'))
  t.ok(release.stdout.includes('open'))
})
