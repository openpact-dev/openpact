/**
 * GET /v1/events SSE stream:
 *   - response sets text/event-stream + cache-control: no-cache
 *   - first frame includes `retry: 1000`
 *   - daemon `entry-applied` events surface as `event: entry-applied`
 *     SSE frames carrying the daemon-side payload as JSON
 *   - closing the request unsubscribes the listeners (no leak)
 *
 * Boots a real daemon + API on an ephemeral port and uses Node's
 * native fetch + ReadableStreamDefaultReader to parse SSE frames.
 */
import test from 'brittle'
import { tmpDaemon } from '../../helpers/tmp-daemon'
import { createApi, bind } from '../../../src/api'

let nextPort = 22000

interface ParsedFrame {
  event?: string
  data?: string
  retry?: number
}

function parseFrames(buf: string): { frames: ParsedFrame[]; rest: string } {
  const frames: ParsedFrame[] = []
  const parts = buf.split('\n\n')
  for (let i = 0; i < parts.length - 1; i++) {
    const block = parts[i]
    const frame: ParsedFrame = {}
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const field = line.slice(0, idx)
      const value = line.slice(idx + 1).replace(/^ /, '')
      if (field === 'event') frame.event = value
      else if (field === 'data') frame.data = value
      else if (field === 'retry') frame.retry = Number(value)
    }
    if (frame.event || frame.data || frame.retry) frames.push(frame)
  }
  return { frames, rest: parts[parts.length - 1] }
}

async function readUntil(
  stream: ReadableStream<Uint8Array>,
  predicate: (frames: ParsedFrame[]) => boolean,
  timeoutMs = 3000,
): Promise<ParsedFrame[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const all: ParsedFrame[] = []
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const next = (await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((r) =>
          setTimeout(() => r({ done: true, value: undefined }), remaining),
        ),
      ])) as { done: boolean; value: Uint8Array | undefined }
      if (next.done || !next.value) break
      buf += decoder.decode(next.value, { stream: true })
      const { frames, rest } = parseFrames(buf)
      buf = rest
      all.push(...frames)
      if (predicate(all)) return all
    }
    return all
  } finally {
    reader.cancel().catch(() => {})
  }
}

test('GET /v1/events streams an SSE entry-applied frame after a knowledge POST', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })
  t.teardown(() => app.close())

  const res = await fetch(`http://127.0.0.1:${port}/v1/events`)
  t.is(res.status, 200)
  t.is(res.headers.get('content-type'), 'text/event-stream')
  t.ok(res.headers.get('cache-control')?.includes('no-cache'))
  t.ok(res.body, 'stream body present')

  // Trigger an entry-applied while the stream is open.
  setTimeout(() => {
    fetch(`http://127.0.0.1:${port}/v1/pacts/default/knowledge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'sse', content: 'live update' }),
    })
  }, 50)

  const frames = await readUntil(res.body!, (fs) => fs.some((f) => f.event === 'entry-applied'))

  // First frame is always the retry hint.
  t.is(frames[0].retry, 1000, 'first frame sets retry: 1000')

  const applied = frames.find((f) => f.event === 'entry-applied')
  t.ok(applied, 'received an entry-applied frame')
  const payload = JSON.parse(applied!.data!)
  t.is(payload.entry?.payload?.content, 'live update')
})
