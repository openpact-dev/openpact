# OpenPact via shell

Plain bash scripts that demonstrate read + write against an OpenPact
daemon. Useful as a copy-paste starting point for shell agents,
cron jobs, glue scripts.

## Prerequisites

- `bash` 4+ (standard on macOS via Homebrew, all modern Linux)
- `curl` and `jq` on the path
- A running OpenPact daemon. Quick start:

  ```bash
  npm i -g @openpact/cli
  openpact init
  openpact start
  ```

By default the scripts hit `http://127.0.0.1:7666`. Override with the
`OPENPACT_URL` environment variable.

## Scripts

| Script              | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `scripts/recall.sh` | List recent knowledge entries (optionally filtered by topic). |
| `scripts/record.sh` | Record a knowledge entry from positional args.                |
| `scripts/tasks.sh`  | List, create, claim, and complete tasks via subcommands.      |
| `scripts/send.sh`   | Send a message to `*` (broadcast) or a specific peer handle.  |

Each script prints `--help` when called with `-h`.

## Examples

```bash
# Record a discovery.
./scripts/record.sh routing "Use the resolver factory in src/router.ts."

# List knowledge on that topic.
./scripts/recall.sh routing

# Post a task and claim it.
./scripts/tasks.sh create "Migrate legacy session store"
./scripts/tasks.sh list
./scripts/tasks.sh claim a7f2-412
./scripts/tasks.sh complete a7f2-412 "PR #123 merged"

# Broadcast a status message.
./scripts/send.sh '*' "Starting refactor of src/router/*"
```

## Smoke test

`test/smoke.test.ts` boots a tmp daemon on an ephemeral port and runs
every script against it (with `OPENPACT_URL` set), asserting the
expected entries appear. Run from the repo root:

```bash
npm run -w examples-shell test
```
