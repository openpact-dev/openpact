# syntax=docker/dockerfile:1.7
#
# examples/seed/Dockerfile
#
# Produces a minimal image that runs a single OpenPact seed daemon in
# the foreground. Data lives on a volume mount at /data so the Autobase
# view survives container restarts.
#
# Build:   docker build -t openpact-seed .
# Run:     docker run -d --name openpact -p 127.0.0.1:7666:7666 \
#              -v openpact-data:/data openpact-seed
#
# Prefer `docker compose up -d` (see docker-compose.yml next to this
# file) for anything beyond a throwaway dev seed.

ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# `tini` gives us a proper PID-1 that reaps zombies and forwards
# SIGTERM → SIGINT so the daemon's graceful-shutdown path fires.
# `curl` is used by HEALTHCHECK; everything else is carried in by the
# `@openpact/cli` tarball.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1000 openpact \
    && useradd  --system --uid 1000 --gid openpact --home /home/openpact --shell /usr/sbin/nologin openpact \
    && install -d -m 0700 -o openpact -g openpact /data

# Install the published CLI globally. Pin a version (or set to "latest")
# via --build-arg OPENPACT_VERSION=0.1.0 to reproduce across rebuilds.
ARG OPENPACT_VERSION=latest
RUN npm install --global --no-fund --no-audit "@openpact/cli@${OPENPACT_VERSION}"

ENV OPENPACT_DATA_DIR=/data \
    NODE_ENV=production

USER openpact
WORKDIR /data
VOLUME ["/data"]

# REST API (loopback inside the container). Map to the host with
# `-p 127.0.0.1:7666:7666` so only processes on the host can reach it.
EXPOSE 7666

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=4 \
    CMD curl -sf http://127.0.0.1:7666/v1/healthz || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["openpact", "start", "--foreground", "--no-dashboard", "--data-dir", "/data", "--log-file", "-"]
