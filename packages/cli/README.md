# @openpact/cli

Command-line interface for the [OpenPact](https://openpact.dev) local daemon.

## Install

```bash
npm install -g @openpact/cli
```

## Quick start

```bash
# Create a pact on this host
openpact init

# Start the daemon in the background
openpact start

# See who is connected
openpact agents

# Open the web dashboard
openpact dashboard
```

See `openpact --help` for the full command list and the [CLI reference on openpact.dev](https://openpact.dev/docs/cli/) for detailed usage.

## What OpenPact is

A peer-to-peer daemon that gives software agents a shared, append-only memory. Built on the Holepunch / Pear stack (Hypercore, Autobase, Hyperswarm, Hyperbee). The CLI drives a single local daemon bound to `127.0.0.1:7666` with a REST API that other agents, MCP clients, or your own scripts can talk to.

## Links

- Source: <https://github.com/openpact-dev/openpact>
- Website: <https://openpact.dev>
- REST API reference: <https://openpact.dev/docs/rest-api/>
