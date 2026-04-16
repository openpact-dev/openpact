/**
 * Minimal mock OpenPact for unit tests. Each resource method is a
 * spy that records its last call and returns a queued value (or a
 * thrown error when scripted with throwNext).
 */
export interface SpyCall {
  args: unknown[]
}

export interface Spy<T = unknown> {
  (...args: unknown[]): Promise<T>
  calls: SpyCall[]
  resolveWith(value: T): void
  rejectWith(err: unknown): void
}

export function spy<T = unknown>(): Spy<T> {
  let next: { ok: true; value: T } | { ok: false; err: unknown } = {
    ok: true,
    value: undefined as T,
  }
  const fn = ((...args: unknown[]) => {
    fn.calls.push({ args })
    if (next.ok) return Promise.resolve(next.value)
    return Promise.reject(next.err)
  }) as Spy<T>
  fn.calls = []
  fn.resolveWith = (value: T) => {
    next = { ok: true, value }
  }
  fn.rejectWith = (err: unknown) => {
    next = { ok: false, err }
  }
  return fn
}

export interface FakePact {
  ping: Spy
  status: Spy
  peers: Spy
  knowledge: { list: Spy; create: Spy }
  tasks: { list: Spy; get: Spy; create: Spy; claim: Spy; complete: Spy; release: Spy }
  skills: { list: Spy; create: Spy; getContent: Spy }
  messages: { list: Spy; send: Spy }
  admin: { addMember: Spy; removeMember: Spy }
}

export function fakePact(): FakePact {
  return {
    ping: spy(),
    status: spy(),
    peers: spy(),
    knowledge: { list: spy(), create: spy() },
    tasks: {
      list: spy(),
      get: spy(),
      create: spy(),
      claim: spy(),
      complete: spy(),
      release: spy(),
    },
    skills: { list: spy(), create: spy(), getContent: spy() },
    messages: { list: spy(), send: spy() },
    admin: { addMember: spy(), removeMember: spy() },
  }
}

/**
 * Pulls a registered tool's handler and config out of the McpServer
 * for direct invocation in tests. Reaches into the SDK's private
 * registry — fragile but the alternative is round-tripping through a
 * Client transport which is heavier than per-tool unit tests need.
 */
export function getRegisteredTool(
  server: any,
  name: string,
): {
  description: string
  handler: (args: any) => Promise<any>
} {
  const registry = server._registeredTools ?? server.server?._registeredTools
  if (!registry) throw new Error('mcp server registry not found')
  const entry = registry[name]
  if (!entry) throw new Error(`tool ${name} not registered`)
  return {
    description: entry.description,
    handler: entry.handler ?? entry.callback,
  }
}
