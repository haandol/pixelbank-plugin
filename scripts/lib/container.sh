# Shared host helpers for the verification and release containers.
# shellcheck shell=bash
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
task_repository=haandol/pixelbank-plugin

require_origin() {
    local remote
    remote=$(git -C "$task_root" remote get-url origin)
    if [[ "$remote" != "https://github.com/$task_repository.git" ]]; then
        printf '%s\n' "origin must be https://github.com/$task_repository.git" >&2
        exit 1
    fi
}

require_clean_head() {
    if [[ -n "$(git -C "$task_root" status --porcelain --untracked-files=normal)" ]]; then
        printf '%s\n' 'Commit or remove every non-ignored change before verification or publication.' >&2
        exit 1
    fi
}

receipt_path() {
    local common
    common=$(cd "$task_root" && cd "$(git rev-parse --git-common-dir)" && pwd)
    printf '%s/pixelbank-plugin/verified/%s.receipt' "$common" "$1"
}

# The release image tag follows its inputs, so edited tooling is never reused stale.
release_image() {
    local digest image
    digest=$(cat "$task_root"/.devcontainer/release/* | shasum -a 256 | cut -c1-16)
    image="pixelbank-plugin-release:$digest"
    if ! docker image inspect "$image" >/dev/null 2>&1; then
        docker build --quiet --tag "$image" "$task_root/.devcontainer/release" >/dev/null
    fi
    printf '%s' "$image"
}

# Run one release-container command with the host GitHub credential on stdin.
run_release_container() {
    local workspace_mode=$1
    shift
    local mounts=(--mount "type=bind,source=$task_root,target=/workspace${workspace_mode}")
    while [[ $# -gt 0 && "$1" != -- ]]; do
        mounts+=("$1")
        shift
    done
    shift
    local image
    image=$(release_image)
    gh auth token --hostname github.com | docker run --rm -i \
        --user "$(id -u):$(id -g)" \
        --read-only --cap-drop ALL --security-opt no-new-privileges \
        --memory 512m --pids-limit 128 \
        --tmpfs /tmp:rw,noexec,nosuid,size=64m,mode=1777 \
        --tmpfs /run/credentials:rw,noexec,nosuid,size=1m,mode=1777 \
        --env HOME=/tmp --env GH_CONFIG_DIR=/tmp/gh \
        "${mounts[@]}" \
        --workdir /workspace \
        --entrypoint /usr/local/bin/pixelbank-container \
        "$image" "$@"
}
