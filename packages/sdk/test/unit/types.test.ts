// Type-only assertions. "Passes" by virtue of `tsc --noEmit` producing no
// errors. The @ts-expect-error lines must remain valid errors — if any
// becomes a non-error (e.g. types loosen unexpectedly), the build fails
// loudly, which is the point.
//
// This file is also picked up by brittle as a `.test.ts`, but contains
// no runtime assertions; brittle records 0 tests for it. The value is
// in the typecheck pass.

import test from 'brittle'
import {
  OpenPact,
  TaskNotOpenError,
  type ClientOpts,
  type KnowledgeEntry,
  type StatusPayload,
  type TaskState,
} from '../../src'

// Construction with no args.
const pact1 = new OpenPact()

// Construction with full opts.
const pact2 = new OpenPact({
  baseUrl: 'http://example:1234',
  port: 7666,
  host: '127.0.0.1',
  fetch: globalThis.fetch,
} satisfies ClientOpts)

void pact2

// Inferred return types compile.
async function _shape(pact: OpenPact) {
  const s: StatusPayload = await pact.status()
  void s.entries
  const k = await pact.knowledge.list({ topic: 'x', limit: 5 })
  const kEntries: KnowledgeEntry[] = k.entries
  void kEntries[0]?.payload.topic
  void (k.has_more as boolean)
  void (k.cursor as string | null)
  const t: TaskState = await pact.tasks.get('aaaaaaaa-1')
  void t.status
  // TTL fields exist on TaskState (added in §2.4).
  const _expiredAt: string | null = t.expired_at
  const _claimedAt: string | null = t.claimed_at
  void _expiredAt
  void _claimedAt
}

// Bad arg types must be rejected.
async function _badCalls(pact: OpenPact) {
  // @ts-expect-error topic must be a string, not a number
  await pact.knowledge.list({ topic: 123 })
  // @ts-expect-error status enum is constrained
  await pact.tasks.list({ status: 'bogus' })
  // @ts-expect-error format enum is constrained
  await pact.skills.list({ format: 'autogen' })
  // @ts-expect-error key is required
  await pact.admin.addMember()
}

// Error class hierarchy: TaskNotOpenError extends OpenPactError extends Error.
const _err: Error = new TaskNotOpenError('x')
void _err

// Single runtime assertion so brittle records this file. The real value
// is the typecheck.
test('types: types.test.ts compiles under tsc --noEmit', (t) => {
  t.pass('see file source for type-only assertions')
})

void _shape
void _badCalls
void pact1
