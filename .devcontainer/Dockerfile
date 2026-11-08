FROM oven/bun:1.4.2-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Expose accidental Node commands instead of satisfying them with Bun's alias.
RUN test "$(readlink /usr/local/bun-node-fallback-bin/node)" = /usr/local/bin/bun \
    && rm /usr/local/bun-node-fallback-bin/node

USER bun
WORKDIR /workspaces/pixelbank-plugin
