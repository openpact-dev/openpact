import test from 'brittle'
import { jsonContent, summaryAndJson, errorContent, safeHandler } from '../../src/format'
import { TaskNotOpenError } from '@openpact/sdk'

test('jsonContent: stringifies value as text content', (t) => {
  const r = jsonContent({ a: 1, b: 'two' })
  t.is(r.content[0].type, 'text')
  t.is(r.content[0].text, '{\n  "a": 1,\n  "b": "two"\n}')
  t.absent(r.isError)
})

test('summaryAndJson: prepends a one-line summary', (t) => {
  const r = summaryAndJson('Did the thing.', { id: 'x' })
  t.ok(r.content[0].text.startsWith('Did the thing.\n\n{'))
})

test('errorContent: SDK errors render with code prefix and isError', (t) => {
  const err = new TaskNotOpenError('lost claim race; current claimer anon-foo-1234')
  const r = errorContent(err)
  t.is(r.isError, true)
  t.is(r.content[0].text, 'TASK_NOT_OPEN: lost claim race; current claimer anon-foo-1234')
})

test('errorContent: non-SDK errors surface the message verbatim', (t) => {
  const r = errorContent(new Error('boom'))
  t.is(r.isError, true)
  t.is(r.content[0].text, 'boom')
})

test('safeHandler: passes the result through on success', async (t) => {
  const r = await safeHandler(async () => jsonContent({ ok: true }))
  t.is(r.isError, undefined)
  t.is(r.content[0].text, '{\n  "ok": true\n}')
})

test('safeHandler: turns thrown SDK errors into errorContent', async (t) => {
  const r = await safeHandler(async () => {
    throw new TaskNotOpenError('nope')
  })
  t.is(r.isError, true)
  t.is(r.content[0].text, 'TASK_NOT_OPEN: nope')
})
