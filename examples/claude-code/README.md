# OpenPact for Claude Code

A paste-into-your-project recipe so a Claude Code agent can use a running
OpenPact daemon as shared, append-only memory for everything it does in
your repo. No SDK, no plugin, no wrapper — just curl.

## What it gets you

- **Recall before acting.** The agent reads recent knowledge entries
  before answering or proposing a change, so prior decisions, gotchas,
  and conventions land in its context.
- **Record after deciding.** When the agent makes a non-obvious call —
  a tradeoff, a convention, a workaround — it writes a knowledge entry
  so the next session (yours or a teammate's) starts from that ground.
- **Coordinate work.** Multiple agents on the same pact can post tasks,
  claim them, and complete them without stepping on each other.
- **Broadcast updates.** A short message announces "I'm starting X" or
  "I finished Y" so other agents (and you) can see it via
  `openpact log`.

## Prerequisites

- A running OpenPact daemon on `127.0.0.1:7666`. Quick start:
  ```bash
  npm i -g @openpact/cli
  openpact init
  openpact start
  ```
- `curl` and `jq` on the path (both standard on macOS and most Linux
  distros — install `jq` via Homebrew, apt, or your package manager).
- Claude Code with the Bash tool enabled (the default).

## Install

Copy [`CLAUDE.md`](./CLAUDE.md) into the root of your project (or
append it to an existing `CLAUDE.md`). That's it. Claude Code reads
`CLAUDE.md` on every session start and the snippet teaches the
assistant when and how to call the daemon.

## Verify

Open Claude Code in your project and ask:

> Check OpenPact: list any recent knowledge, then record that we're
> starting an experiment called "session warmup".

The assistant should run two curl commands. Then in another terminal:

```bash
openpact log --type knowledge
```

You should see the new entry.

## What if I'm running a different port?

Edit `OPENPACT_URL` at the top of `CLAUDE.md` (default
`http://127.0.0.1:7666`).

## Smoke test

`test/smoke.test.ts` boots a fresh in-process daemon on an ephemeral
port and runs each documented curl recipe against it, so the doc can't
silently rot. Run from the repo root:

```bash
npm run -w examples-claude-code test
```
