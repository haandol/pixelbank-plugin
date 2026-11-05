#!/usr/bin/env bash
# Publish an already pushed annotated version tag from the release container.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/container.sh"

require_origin
task_tag=${1:-}
[[ "$task_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { printf '%s\n' 'Usage: bash scripts/container-release.sh vX.Y.Z' >&2; exit 2; }
[[ -s "$task_root/.release/notes-$task_tag.md" ]] || { printf '%s\n' "Write the Korean release notes in .release/notes-$task_tag.md first." >&2; exit 1; }
run_release_container ',readonly' -- release "$task_tag"
