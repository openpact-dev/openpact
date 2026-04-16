# examples/seed — OpenPact seed node

A **seed node** is a long-running `openpact` daemon that does one thing: stay
online so other peers can reach the pact(s) it holds. In a production
deployment it's usually the only daemon on a dedicated host, running as an
indexer for the pacts your team cares about.

This directory contains three ready-to-use deployment recipes:

| File                                | When to use                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `Dockerfile` + `docker-compose.yml` | Any host that already runs Docker. Easiest to get going; also the CI-test target.  |
| `systemd/openpact.service`          | Linux hosts (Ubuntu, Debian, Fedora, etc.) where `openpact` is installed globally. |
| `launchd/com.openpact.daemon.plist` | macOS hosts (development seeds, laptops you leave on).                             |

All three run the daemon in **foreground** mode (`openpact start --foreground
--no-dashboard`) and rely on the supervisor (`docker`, `systemd`, `launchd`)
for restart and log rotation. The daemon's own `/v1/healthz` and `/v1/readyz`
endpoints are used as liveness/readiness probes — see the example
configurations below.

## What a seed daemon does

1. Binds the REST API on `127.0.0.1:7666` (loopback only — never expose it).
2. Joins the hyperswarm DHT and seeds every pact listed in
   `<dataDir>/daemon.json`.
3. Acts as the indexer (apply-fn writer) for any pact where it was the
   creator, so claims/releases/confirmations keep making forward progress
   even while other peers are offline.
4. Persists its Autobase view + Hyperbee under `<dataDir>/hosts/default/`.

No dashboard is started (`--no-dashboard`) because the seed is headless.
Operators who want a UI should run the dashboard separately or use
`openpact status` from an SSH session.

## Picking a data directory

Every recipe below points at `/var/lib/openpact` (Linux) or
`~/Library/Application Support/openpact` (macOS). The directory should be:

- **Owned by the user the daemon runs as** (not root).
- **Chmod 0700** — everything inside, including the bearer token in
  `daemon.json`, is sensitive.
- **On persistent storage** — losing the directory means losing the pact
  and all its history.
- **Backed up** (at least the `daemon.json` + the corestore) if the host
  is the only indexer. Otherwise peers re-sync from the swarm on recovery.

## Quick start — Docker

```bash
cd examples/seed
docker compose up -d
docker compose logs -f openpact
# Probe it from the host once ports are mapped (default: loopback only):
docker compose exec openpact curl -sf http://127.0.0.1:7666/v1/healthz
```

The first boot creates a default pact — treat the printed `pact_id` as the
one you hand to other peers via `openpact join`. Subsequent restarts reuse
the existing data volume and pick up where they left off.

## Quick start — systemd (Linux)

```bash
sudo useradd --system --home /var/lib/openpact --shell /usr/sbin/nologin openpact
sudo install -d -m 0700 -o openpact -g openpact /var/lib/openpact
sudo install -m 0644 examples/seed/systemd/openpact.service /etc/systemd/system/openpact.service
sudo systemctl daemon-reload
sudo systemctl enable --now openpact
sudo systemctl status openpact
journalctl -u openpact -f
```

`ExecStartPost` waits for `/v1/healthz` to return 200 before systemd
considers the service `active`. The unit uses hardened settings
(`ProtectSystem=strict`, `NoNewPrivileges=yes`, etc.) — adjust if your host
needs different defaults.

## Quick start — launchd (macOS)

```bash
sudo install -d -m 0700 -o $(id -un) -g $(id -gn) /usr/local/var/openpact
sudo cp examples/seed/launchd/com.openpact.daemon.plist /Library/LaunchDaemons/
sudo launchctl bootstrap system /Library/LaunchDaemons/com.openpact.daemon.plist
sudo launchctl print system/com.openpact.daemon
```

Logs are written to `/usr/local/var/log/openpact/`. `KeepAlive` restarts the
daemon on crashes; `ThrottleInterval=10` prevents restart loops from
hammering the CPU.

## Getting the bearer token out

Every recipe persists the daemon's auto-minted bearer token to
`<dataDir>/daemon.json`. To hand it to an SDK client running on another box:

```bash
# Docker
docker compose exec openpact cat /data/daemon.json | jq -r .apiToken
# systemd
sudo cat /var/lib/openpact/daemon.json | jq -r .apiToken
# launchd
sudo cat /usr/local/var/openpact/daemon.json | jq -r .apiToken
```

Treat the token like an SSH private key. Rotate it by deleting `daemon.json`
and restarting the daemon — a fresh token is generated on the next boot.

## Health-probe cheatsheet

| Endpoint          | Purpose                       | Auth   | Used by                                                                    |
| ----------------- | ----------------------------- | ------ | -------------------------------------------------------------------------- |
| `GET /v1/healthz` | Is the process alive?         | None   | systemd `ExecStartPost`, docker `HEALTHCHECK`, launchd out-of-band monitor |
| `GET /v1/readyz`  | Has at least one pact loaded? | None   | Load balancers / k8s readiness probes                                      |
| `GET /v1/metrics` | Prometheus scrape             | Bearer | Prometheus / VictoriaMetrics / OpenTelemetry collectors                    |

All three are implemented in
[`packages/daemon/src/api/routes/health.ts`](../../packages/daemon/src/api/routes/health.ts)
and described in `CLAUDE.md`.
