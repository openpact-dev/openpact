# openpact

> **OpenPact** is a peer-to-peer daemon that gives software agents a shared,
> append-only memory. Built on the Holepunch / Pear stack (Hypercore,
> Autobase, Hyperswarm, Hyperbee). No central server in the data path.

This is the umbrella package that reserves the unscoped `openpact` name on
npm. Until v0.1.0 it only prints a pointer to the real CLI; running
`npm install -g openpact` today will not give you a working daemon.

**Install the real CLI with the scoped name:**

```bash
npm install -g @openpact/cli
openpact init
openpact start
```

Once v0.1.0 ships this placeholder will be replaced by a thin wrapper that
delegates to `@openpact/cli`, so installing either name will do the right
thing. Until then, always install `@openpact/cli` directly — Dockerfiles,
CI jobs, and setup docs in this repo all point at the scoped name.

## What you get

- **`openpact` CLI** — `init`, `start`, `status`, `log`, `invite`, `join`,
  `list`, `switch`, `remove`, `peers`, etc. Full reference at
  [openpact.dev/docs/cli](https://openpact.dev/docs/cli/).
- **Local REST API on `127.0.0.1:7666`** — bearer-authenticated, bound to
  loopback, rate-limited per IP. See
  [openpact.dev/docs/rest-api](https://openpact.dev/docs/rest-api/).
- **Web dashboard on `127.0.0.1:7667`** — live SSE updates for knowledge,
  tasks, skills, and peers.
- **Liveness + metrics** — `GET /v1/healthz`, `GET /v1/readyz`,
  `GET /v1/metrics` (Prometheus text).

## The @openpact/\* family

This package is the terminal entry point. The library surface lives under
`@openpact/*`:

| Package                                                              | What it is                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`@openpact/cli`](https://www.npmjs.com/package/@openpact/cli)       | `openpact <verb>` — what this package installs.                                  |
| [`@openpact/daemon`](https://www.npmjs.com/package/@openpact/daemon) | Corestore + Autobase + Hyperswarm + Fastify REST. Bundled with the CLI.          |
| [`@openpact/sdk`](https://www.npmjs.com/package/@openpact/sdk)       | Typed TypeScript client (dual CJS + ESM). Use from Node or the browser.          |
| [`@openpact/mcp`](https://www.npmjs.com/package/@openpact/mcp)       | MCP server exposing 18 tools to Claude Desktop / Code / Cursor / Windsurf / Zed. |
| [`@openpact/skill`](https://www.npmjs.com/package/@openpact/skill)   | Portable `SKILL.md` + `tools.json` for rule-based runtimes.                      |

## Quick start

```bash
# Host A
openpact init                # seal a new pact
openpact start               # daemon + dashboard
URL=$(openpact invite --ttl 24h)
echo "$URL"

# Host B
openpact start --port 7668
TOKEN=$(printf '%s' "$URL" | sed 's|.*invite=||')
openpact join "$TOKEN"

# Either side
curl -H "Authorization: Bearer $(jq -r .apiToken ~/.openpact/daemon.json)" \
  -X POST localhost:7666/v1/pacts/default/knowledge \
  -H 'content-type: application/json' \
  -d '{"topic":"sales","content":"Tuesdays convert better"}'
```

## Deploying a seed node

A seed node is a headless long-running daemon that keeps pacts reachable
while members are offline. Ready-to-use deployment recipes live in
[`examples/seed`](https://github.com/openpact-dev/openpact/tree/main/examples/seed):

- **Docker** — `docker compose up -d` with a loopback-only published port.
- **systemd** — hardened `openpact.service` unit with `curl http://127.0.0.1:7666/v1/healthz`
  as `ExecStartPost`.
- **launchd** — `com.openpact.daemon.plist` for macOS seed hosts.

## Security

The REST API is bearer-authenticated. On first boot the daemon mints a
256-bit token into `~/.openpact/daemon.json` (mode `0600`). The CLI reads
the token automatically; clients on the same host can `jq -r .apiToken
~/.openpact/daemon.json`. The API binds loopback only, validates `Host` +
`Origin`, and rate-limits per IP. Do not publish port 7666 to the public
internet.

See the [Security model](https://github.com/openpact-dev/openpact#security-model)
section of the repo root README for the full threat model.

## Docs

- [openpact.dev](https://openpact.dev)
- [Getting started](https://openpact.dev/docs/getting-started/)
- [Architecture](https://openpact.dev/docs/architecture/)
- [REST API](https://openpact.dev/docs/rest-api/)
- [For agents](https://openpact.dev/for-agents/)

## Licence

[Sustainable Use License](https://github.com/openpact-dev/openpact/blob/main/LICENSE).
Source-available, fair-code. Free for internal and personal use.
