// Tiny fetch mock for SDK unit tests. Records every call and returns
// scripted responses in order. Matches Node 22+ fetch signature.

export interface MockResponse {
  status?: number
  body?: unknown
  /** Triggers a network-style error (caught as fetch failure). */
  networkError?: Error
}

export interface MockCall {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface MockFetchHandle {
  fetch: typeof globalThis.fetch
  calls: MockCall[]
}

export function mockFetch(...responses: MockResponse[]): MockFetchHandle {
  let i = 0
  const calls: MockCall[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    const initOpts = (init ?? {}) as RequestInit
    const headers: Record<string, string> = {}
    if (initOpts.headers) {
      // The SDK client now wraps headers in a Headers instance so it
      // can set Authorization without clobbering caller-supplied
      // content-type. Accept either shape.
      const raw = initOpts.headers
      if (raw instanceof Headers || typeof (raw as unknown as Headers).forEach === 'function') {
        ;(raw as unknown as Headers).forEach((v, k) => {
          headers[k.toLowerCase()] = v
        })
      } else if (Array.isArray(raw)) {
        for (const [k, v] of raw as Array<[string, string]>) headers[k.toLowerCase()] = v
      } else {
        for (const [k, v] of Object.entries(raw as Record<string, string>)) {
          headers[k.toLowerCase()] = v
        }
      }
    }
    calls.push({
      url,
      method: (initOpts.method as string) ?? 'GET',
      headers,
      body: typeof initOpts.body === 'string' ? initOpts.body : undefined,
    })
    const r = responses[i++] ?? responses[responses.length - 1] ?? { status: 200, body: {} }
    if (r.networkError) throw r.networkError
    const status = r.status ?? 200
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetch, calls }
}
