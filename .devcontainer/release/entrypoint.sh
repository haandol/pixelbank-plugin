#!/bin/sh
set -eu
umask 077

# The host streams its GitHub credential over stdin. It never becomes a Docker
# environment value, image layer, workspace file, URL or command argument.
IFS= read -r task_token || true
if [ -z "${task_token:-}" ]; then
    echo 'A GitHub credential is required on standard input.' >&2
    exit 1
fi
printf '%s' "$task_token" > /run/credentials/github-token
unset task_token

export GIT_CONFIG_GLOBAL=/tmp/pixelbank-gitconfig GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
git config --global safe.directory /workspace

task_mode=${1:-}
[ $# -gt 0 ] && shift
case "$task_mode" in
    git)
        exec git \
            -c credential.helper= \
            -c credential.https://github.com.helper= \
            -c credential.https://github.com.helper=/usr/local/bin/pixelbank-credential \
            -c credential.useHttpPath=true \
            -c core.hooksPath=/workspace/scripts/hooks \
            "$@"
        ;;
    release)
        exec bash /workspace/scripts/publish-release.sh "$@"
        ;;
    *)
        echo 'Choose the git or release container mode.' >&2
        exit 2
        ;;
esac
