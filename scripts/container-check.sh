#!/usr/bin/env bash
# Verify the committed HEAD tree in the Bun verification image and print its receipt path.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/container.sh"

require_clean_head
task_commit=$(git -C "$task_root" rev-parse HEAD)
task_tree=$(git -C "$task_root" rev-parse 'HEAD^{tree}')
task_image=$(docker build --quiet --tag pixelbank-plugin-check "$task_root/.devcontainer")
task_receipt=$(receipt_path "$task_tree")

if [[ -f "$task_receipt" ]] && grep -qxF "image=$task_image" "$task_receipt" && grep -qxF 'passed=true' "$task_receipt"; then
    printf '%s\n' 'Verified source tree unchanged; reusing its container receipt.' >&2
    printf '%s\n' "$task_receipt"
    exit 0
fi
rm -f "$task_receipt"

task_source=$(mktemp -d)
trap 'rm -rf "$task_source"' EXIT
git -C "$task_root" archive "$task_commit" | tar -x -C "$task_source"

# Rebuilding the committed distribution must leave every exported file unchanged.
docker run --rm --init --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$task_source,target=/workspaces/pixelbank-plugin" \
    --env BUN_INSTALL_CACHE_DIR=/tmp/bun-cache \
    "$task_image" bash -c '
        set -euo pipefail
        snapshot() { find . -type d -name node_modules -prune -o -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum; }
        snapshot > /tmp/before
        test -z "$(command -v node)"
        bun install --frozen-lockfile --ignore-scripts
        bun run check
        snapshot > /tmp/after
        if ! cmp -s /tmp/before /tmp/after; then
            diff /tmp/before /tmp/after >&2 || true
            echo "Verification changed committed files; rebuild, review and commit the distribution." >&2
            exit 1
        fi' >&2

mkdir -p -m 700 "$(dirname "$task_receipt")"
printf 'tree=%s\ncommit=%s\nimage=%s\npassed=true\nfinished=%s\n' \
    "$task_tree" "$task_commit" "$task_image" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$task_receipt"
printf '%s\n' "$task_receipt"
