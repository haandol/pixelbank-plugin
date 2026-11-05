#!/usr/bin/env bash
# Install the host pre-push hook that sends publication to the release container.
set -euo pipefail
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_configured=$(git -C "$task_root" config --get core.hooksPath || true)
if [[ -n "$task_configured" && "$task_configured" != */git-defender/hooks ]]; then
    printf '%s\n' "A custom hook manager ($task_configured) is preserved; chain scripts/hooks/pre-push there." >&2
    exit 1
fi
task_hooks="$(cd "$task_root" && cd "$(git rev-parse --git-common-dir)" && pwd)/hooks"
[[ ! -L "$task_hooks" ]] || { printf '%s\n' 'A symlinked hook directory is user-managed and was preserved.' >&2; exit 1; }
mkdir -p "$task_hooks"
task_target="$task_hooks/pre-push"
if [[ -e "$task_target" ]] && ! cmp -s "$task_target" "$task_root/scripts/hooks/pre-push"; then
    printf '%s\n' "An existing $task_target was preserved; chain scripts/hooks/pre-push from it." >&2
    exit 1
fi
install -m 700 "$task_root/scripts/hooks/pre-push" "$task_target"
printf '%s\n' "Installed $task_target; the existing Git hook manager is retained."
