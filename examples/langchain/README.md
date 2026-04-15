# OpenPact for LangChain (Python)

A self-contained Python script that loads the `@openpact/skill`
`tools.json` at boot and codegens LangChain `StructuredTool`
instances for every OpenPact REST endpoint. Drop into your own
LangChain agent and the agent gains shared memory + task
coordination via the local OpenPact daemon.

## Layout

```
openpact_tools.py     # loader; build_tools(base_url) → list[StructuredTool]
example.py            # tiny demo: record one knowledge entry, list it back
tests/example_test.py # pytest exercising the loader against a daemon
test/smoke.test.ts    # node-side wrapper that boots a tmp daemon and runs pytest
```

## Prerequisites

- Python 3.10+ with `pip`
- A running OpenPact daemon. Quick start:

  ```bash
  npm i -g @openpact/cli
  openpact init
  openpact start
  ```

- LangChain + requests:

  ```bash
  pip install -r requirements.txt
  ```

## Run the demo

```bash
python example.py
# Recorded knowledge entry a7f2-412 at 2026-04-15T...
# Recall: [{'topic': 'wiring', 'content': 'langchain demo'}]
```

Override the daemon URL via `OPENPACT_URL=http://10.0.0.5:7666`.

## Run the tests

The Node-side smoke test boots a tmp daemon on an ephemeral port and
shells out to `pytest`:

```bash
npm run -w examples-langchain test
```

If Python or pytest isn't on the path, the smoke test passes with a
"skipped" message — the same test runs for real on the Linux CI
matrix slot.

## How `openpact_tools.py` works

It reads `tools.json` from the installed `@openpact/skill` package,
walks the tool list, and generates one `StructuredTool` per entry.
Each tool's argv is mapped to a query string (for GETs), JSON body
(for POST/PUT), or path-param substitution (for `:id`-style routes).
Daemon errors come back as raised `OpenPactError` with the daemon's
error code — agents see clean exceptions instead of HTTP debris.
