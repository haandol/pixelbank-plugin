#!/usr/bin/env bash
# Accept only verified main or annotated version-tag updates; Git supplies ref updates on stdin.
set -euo pipefail
task_receipt=${1:?receipt path required}
reject() { printf '%s\n' "$1" >&2; exit 1; }

[[ -f "$task_receipt" ]] || reject 'No verification receipt was supplied; push stopped.'
grep -qxF 'passed=true' "$task_receipt" || reject 'The verification receipt did not pass; push stopped.'
task_tree=$(sed -n 's/^tree=\([a-f0-9]\{40\}\)$/\1/p' "$task_receipt")
[[ "$task_tree" =~ ^[a-f0-9]{40}$ ]] || reject 'The verification receipt has no valid source tree; push stopped.'

task_updates=0
while read -r _local_ref task_local_sha task_remote_ref _remote_sha; do
    [[ "$task_local_sha" =~ ^[a-f0-9]{40}$ ]] || reject 'Git supplied an invalid ref update; push stopped.'
    [[ "$task_local_sha" =~ ^0+$ ]] && reject 'Ref deletion is not part of the plugin publication workflow.'
    case "$task_remote_ref" in
        refs/heads/main) ;;
        refs/tags/v[0-9]*.[0-9]*.[0-9]*)
            [[ "$(git cat-file -t "$task_local_sha")" == tag ]] || reject 'Version tags must be annotated.' ;;
        *) reject "Only main and vX.Y.Z tags are published; $task_remote_ref was refused." ;;
    esac
    [[ "$(git rev-parse "$task_local_sha^{tree}")" == "$task_tree" ]] ||
        reject 'Pushed source differs from the verified source; push stopped.'
    task_updates=$((task_updates + 1))
done
[[ "$task_updates" -gt 0 ]] || reject 'No verified source ref update was received.'
