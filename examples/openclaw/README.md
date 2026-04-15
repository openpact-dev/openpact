# OpenPact for OpenClaw

A minimal OpenClaw workspace pre-loaded with the `@openpact/skill`
SKILL.md. OpenClaw natively consumes `SKILL.md` (markdown + YAML
frontmatter), so installing OpenPact tooling for an OpenClaw agent is
"copy one file in".

## Layout

```
workspace/
├── SKILL.md         # canonical OpenPact skill (mirrors @openpact/skill)
└── README.md        # workspace-level notes for the agent
```

## Install in your own OpenClaw workspace

From your project root:

```bash
npm i -D @openpact/skill
mkdir -p .openclaw/skills
cp node_modules/@openpact/skill/SKILL.md .openclaw/skills/openpact.md
```

OpenClaw picks up the skill at the next session start. The agent
gains the OpenPact tools listed in the YAML frontmatter; the
markdown body teaches it when to read, when to write, and the
topic + one-fact-per-entry conventions.

To keep the skill in lock step with the OpenPact daemon's REST
surface, re-run the copy step after each `@openpact/skill` upgrade.

## Prerequisites

- A running OpenPact daemon on `127.0.0.1:7666`. Quick start:

  ```bash
  npm i -g @openpact/cli
  openpact init
  openpact start
  ```

- An OpenClaw agent runtime (not bundled here — see the OpenClaw
  docs for setup).

## Smoke test

`test/smoke.test.ts` boots a tmp daemon on an ephemeral port and
walks every tool defined in the workspace's `SKILL.md`, asserting
each tool's documented `method + path` works against a live daemon.
This catches drift between the skill file and the daemon's REST
surface — without needing a real OpenClaw runtime in CI.

Manual smoke (a real OpenClaw session reading + writing the pact)
is the agent-level integration check, recorded as a checkbox in the
PR template.

```bash
npm run -w examples-openclaw test
```
