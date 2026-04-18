/**
 * Boot a real OpenPact daemon, spawn the published bin
 * (`bin/openpact-mcp.js`) as an MCP stdio child, complete the full
 * MCP handshake, and round-trip a tool call.
 *
 * Regression guard for a bug in `@openpact/mcp@0.1.1` where the bin
 * did `require('../dist/cjs/cli.js')` but `cli.js` only ran `main()`
 * behind a `require.main === module` guard — which is false when
 * loaded via the bin shim. The server started, ran zero code, and
 * exited silently, so `npx -y @openpact/mcp` never worked as a
 * real MCP server. The in-memory transport tests in
 * `against-daemon.test.ts` missed it because they import `buildServer`
 * directly and bypass the bin entirely.
 */
import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Daemon, createApi, bind } from '@openpact/daemon'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const BIN = path.resolve(__dirname, '../../bin/openpact-mcp.js')
let nextPort = 19950

test('bin shim spawns a working MCP server over stdio', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-mcp-bin-'))
  const daemon = await Daemon.create({ dataDir: dir })
  const app = createApi(daemon)
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })

  // createApi(daemon) without opts.token skips the auth hook (test-only
  // mode), so we can run the child process without wiring a token.
  // Pass no --pact-id so the bin exercises the defaulting path:
  // `Daemon.create` marks a "default" alias current, and the bin
  // should discover it via `pact.pacts.list()` at startup. A
  // per-pact tool call (pact_status) then proves it worked.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN, '--base-url', `http://127.0.0.1:${port}`],
    stderr: 'pipe',
  })

  const client = new Client({ name: 'bin-shim-test', version: '0.0.0' })

  t.teardown(async () => {
    await client.close().catch(() => {})
    await app.close()
    await daemon.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })

  // If the bin bootstrap is broken the child exits silently before
  // the handshake completes and `connect` rejects. That's the bug
  // we're guarding against.
  await client.connect(transport)

  const tools = await client.listTools()
  const names = tools.tools.map((tool) => tool.name)
  t.ok(names.includes('ping'), 'bin-spawned server lists the ping tool')
  t.ok(names.includes('list_pacts'), 'registers the new list_pacts tool')
  t.ok(names.includes('switch_pact'), 'registers the new switch_pact tool')

  const pingResult = await client.callTool({ name: 'ping', arguments: {} })
  t.absent(pingResult.isError, 'ping tool call did not return isError')

  // If default-pact discovery is wired up, pact_status succeeds
  // against the daemon's auto-created "default" alias. Before the
  // fix this would error with "OpenPact client has no pactId set".
  const statusResult = await client.callTool({ name: 'pact_status', arguments: {} })
  t.absent(statusResult.isError, 'pact_status works without an explicit --pact-id flag')
})
