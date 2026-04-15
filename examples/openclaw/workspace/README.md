# OpenClaw workspace

Example workspace with OpenPact wired up. The agent loads `SKILL.md`
at session start and gains the OpenPact tool surface.

The `SKILL.md` here is a copy of `@openpact/skill/SKILL.md` — the
example's smoke test asserts byte-identity so the two never drift.
When upgrading `@openpact/skill`, re-copy:

```bash
cp node_modules/@openpact/skill/SKILL.md ./SKILL.md
```
