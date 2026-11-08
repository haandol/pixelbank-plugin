# Publishing and archive tools only. Builds and tests run in the Bun verification image.
FROM alpine:3.22
RUN apk add --no-cache bash ca-certificates coreutils curl git github-cli jq unzip
COPY entrypoint.sh /usr/local/bin/pixelbank-container
COPY git-credential.sh /usr/local/bin/pixelbank-credential
RUN chmod 755 /usr/local/bin/pixelbank-container /usr/local/bin/pixelbank-credential
ENV SHELL=/bin/bash
WORKDIR /workspace
