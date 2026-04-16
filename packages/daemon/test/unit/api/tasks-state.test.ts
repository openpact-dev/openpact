import test from 'brittle'
import { reduceTaskHistory, type TaskEntry } from '../../../src/api/tasks-state'

const TS = '2026-04-14T10:00:00.000Z'

/**
 * All tests here use timestamps near TS. The reducer's wall-clock TTL
 * check would expire those claims the moment real time drifts past
 * TS + 24h, turning fresh tests red purely because of the calendar.
 * Pin `clockMs` to TS so the check is deterministic.
 */
const fixedClock = { clockMs: () => Date.parse(TS) + 1_000 }

function task(
  id: string,
  status: 'open' | 'claimed' | 'complete',
  opts: { agent?: string; refs?: string[]; claimed_by?: string; result?: string } = {},
): TaskEntry {
  return {
    id,
    type: 'task',
    timestamp: TS,
    agent_id: opts.agent || 'anon-krait-7f2d9999',
    refs: opts.refs,
    payload: {
      title: 'task title',
      status,
      claimed_by: opts.claimed_by,
      result: opts.result,
    },
  }
}

test('reduce: empty history returns null', (t) => {
  t.is(reduceTaskHistory([]), null)
})

test('reduce: single open task → open state', (t) => {
  const state = reduceTaskHistory([task('aaaaaaaa-1', 'open')])!
  t.is(state.status, 'open')
  t.is(state.claimed_by, null)
})

test('reduce: claim transitions open → claimed', (t) => {
  const state = reduceTaskHistory(
    [
      task('aaaaaaaa-1', 'open'),
      task('bbbbbbbb-2', 'claimed', {
        refs: ['aaaaaaaa-1'],
        agent: 'anon-cobra-3e910000',
        claimed_by: 'anon-cobra-3e910000',
      }),
    ],
    fixedClock,
  )!
  t.is(state.status, 'claimed')
  t.is(state.claimed_by, 'anon-cobra-3e910000')
})

test('reduce: two concurrent claims → first by entry-id wins', (t) => {
  const state = reduceTaskHistory(
    [
      task('aaaaaaaa-1', 'open'),
      task('cccccccc-2', 'claimed', {
        refs: ['aaaaaaaa-1'],
        agent: 'anon-c',
        claimed_by: 'anon-c',
      }),
      task('bbbbbbbb-2', 'claimed', {
        refs: ['aaaaaaaa-1'],
        agent: 'anon-b',
        claimed_by: 'anon-b',
      }),
    ],
    fixedClock,
  )!
  // bbbbbbbb-2 < cccccccc-2 lexicographically, so anon-b wins
  t.is(state.status, 'claimed')
  t.is(state.claimed_by, 'anon-b')
})

test('reduce: complete from claimer transitions claimed → complete', (t) => {
  const state = reduceTaskHistory([
    task('aaaaaaaa-1', 'open'),
    task('bbbbbbbb-2', 'claimed', { refs: ['aaaaaaaa-1'], agent: 'anon-b', claimed_by: 'anon-b' }),
    task('bbbbbbbb-3', 'complete', { refs: ['aaaaaaaa-1'], agent: 'anon-b', result: 'done' }),
  ])!
  t.is(state.status, 'complete')
  t.is(state.result, 'done')
})

test('reduce: complete from non-claimer is ignored', (t) => {
  const state = reduceTaskHistory(
    [
      task('aaaaaaaa-1', 'open'),
      task('bbbbbbbb-2', 'claimed', {
        refs: ['aaaaaaaa-1'],
        agent: 'anon-b',
        claimed_by: 'anon-b',
      }),
      task('cccccccc-3', 'complete', { refs: ['aaaaaaaa-1'], agent: 'anon-c', result: 'sneaky' }),
    ],
    fixedClock,
  )!
  t.is(state.status, 'claimed')
  t.is(state.result, null)
})

test('reduce: release by claimer reverts to open', (t) => {
  const state = reduceTaskHistory([
    task('aaaaaaaa-1', 'open'),
    task('bbbbbbbb-2', 'claimed', { refs: ['aaaaaaaa-1'], agent: 'anon-b', claimed_by: 'anon-b' }),
    task('bbbbbbbb-3', 'open', { refs: ['aaaaaaaa-1'], agent: 'anon-b' }),
  ])!
  t.is(state.status, 'open')
  t.is(state.claimed_by, null)
})

test('reduce: release by non-claimer ignored', (t) => {
  const state = reduceTaskHistory(
    [
      task('aaaaaaaa-1', 'open'),
      task('bbbbbbbb-2', 'claimed', {
        refs: ['aaaaaaaa-1'],
        agent: 'anon-b',
        claimed_by: 'anon-b',
      }),
      task('cccccccc-3', 'open', { refs: ['aaaaaaaa-1'], agent: 'anon-c' }),
    ],
    fixedClock,
  )!
  t.is(state.status, 'claimed')
  t.is(state.claimed_by, 'anon-b')
})

test('reduce: skip-claim — open → complete by anyone', (t) => {
  const state = reduceTaskHistory([
    task('aaaaaaaa-1', 'open'),
    task('cccccccc-2', 'complete', { refs: ['aaaaaaaa-1'], agent: 'anon-c', result: 'quick' }),
  ])!
  t.is(state.status, 'complete')
  t.is(state.result, 'quick')
})

test('reduce: late claim against completed task is ignored', (t) => {
  const state = reduceTaskHistory([
    task('aaaaaaaa-1', 'open'),
    task('bbbbbbbb-2', 'complete', { refs: ['aaaaaaaa-1'], agent: 'anon-b', result: 'done' }),
    task('cccccccc-3', 'claimed', { refs: ['aaaaaaaa-1'], agent: 'anon-c', claimed_by: 'anon-c' }),
  ])!
  t.is(state.status, 'complete')
})

test('reduce: deterministic across equivalent histories with different append order', (t) => {
  const events = [
    task('aaaaaaaa-1', 'open'),
    task('bbbbbbbb-2', 'claimed', { refs: ['aaaaaaaa-1'], agent: 'anon-b', claimed_by: 'anon-b' }),
    task('cccccccc-2', 'claimed', { refs: ['aaaaaaaa-1'], agent: 'anon-c', claimed_by: 'anon-c' }),
  ]
  const a = reduceTaskHistory(events)!
  const b = reduceTaskHistory([events[2], events[0], events[1]])!
  t.is(a.status, b.status)
  t.is(a.claimed_by, b.claimed_by)
})
