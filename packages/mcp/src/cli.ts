import { OpenPact, type ClientOpts } from '@openpact/sdk'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { buildServer } from './server'

export interface ParsedArgs {
  baseUrl?: string
  host?: string
  port?: number
  pactId?: string
  help?: boolean
  version?: boolean
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--base-url':
        out.baseUrl = argv[++i]
        break
      case '--host':
        out.host = argv[++i]
        break
      case '--port':
        out.port = Number(argv[++i])
        break
      case '--pact':
      case '--pact-id':
        out.pactId = argv[++i]
        break
      case '-h':
      case '--help':
        out.help = true
        break
      case '-v':
      case '--version':
        out.version = true
        break
      default:
        throw new Error(`unknown argument: ${a}`)
    }
  }
  return out
}

export function resolveClientOpts(args: ParsedArgs, env: NodeJS.ProcessEnv): ClientOpts {
  const opts: ClientOpts = {}
  if (args.baseUrl) opts.baseUrl = args.baseUrl
  else if (env.OPENPACT_URL) opts.baseUrl = env.OPENPACT_URL
  if (args.host) opts.host = args.host
  if (args.port !== undefined) {
    if (!Number.isFinite(args.port)) throw new Error('--port must be a number')
    opts.port = args.port
  }
  const pactId = args.pactId ?? env.OPENPACT_PACT
  if (pactId) opts.pactId = pactId
  return opts
}

const HELP = `openpact-mcp — MCP server for the OpenPact daemon

Usage: openpact-mcp [options]

Options:
  --base-url <url>   Full daemon base URL (default $OPENPACT_URL or http://127.0.0.1:7666)
  --host <host>      Daemon host (overrides the host portion of base-url)
  --port <port>      Daemon port (overrides the port portion of base-url)
  --pact <alias>     Pact to address (alias or 64-hex pact ID).
                     Defaults to $OPENPACT_PACT, then the daemon's current pact.
  --pact-id <alias>  Alias for --pact (same meaning).
  -h, --help         Show this help and exit
  -v, --version      Print version and exit

Environment:
  OPENPACT_URL       Default base URL for the daemon
  OPENPACT_PACT      Default pact alias (used if --pact is not given)

This server speaks MCP over stdio. Register it in your client's
mcpServers config to give the agent OpenPact tools.
`

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  let args: ParsedArgs
  try {
    args = parseArgs(argv)
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n\n${HELP}`)
    return 2
  }

  if (args.help) {
    process.stderr.write(HELP)
    return 0
  }
  if (args.version) {
    // Read version from our own package.json so we don't have to keep two in sync.
    const pkg = require('../../package.json')
    process.stderr.write(`${pkg.version}\n`)
    return 0
  }

  const opts = resolveClientOpts(args, env)
  const pact = new OpenPact(opts)
  const server = buildServer(pact)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(`openpact-mcp ready (daemon: ${pact.baseUrl})\n`)
  return 0
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      if (code !== 0) process.exit(code)
    },
    (err) => {
      process.stderr.write(`fatal: ${(err as Error).stack ?? err}\n`)
      process.exit(1)
    },
  )
}
