#!/usr/bin/env bash
# Run Git in the release container. Pushes require a container receipt for HEAD.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/container.sh"

require_origin
[[ $# -gt 0 ]] || set -- status --short --branch
task_mounts=()
if [[ "$1" == push ]]; then
    task_refs=()
    for task_arg in "${@:2}"; do
        case "$task_arg" in -u|--set-upstream) ;; *) task_refs+=("$task_arg") ;; esac
    done
    task_ref=${task_refs[1]:-}
    if [[ "${#task_refs[@]}" != 2 || "${task_refs[0]}" != origin ||
          ! ( "$task_ref" == main || "$task_ref" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ) ]]; then
        printf '%s\n' 'Container publishing uses: push [-u] origin main, or push origin vX.Y.Z.' >&2
        exit 2
    fi
    [[ "$(git -C "$task_root" symbolic-ref --short HEAD)" == main ]] || { printf '%s\n' 'Publish from the main checkout.' >&2; exit 1; }
    if [[ "$task_ref" != main && "$(git -C "$task_root" rev-parse "$task_ref^{commit}")" != "$(git -C "$task_root" rev-parse HEAD)" ]]; then
        printf '%s\n' "Check out the commit of $task_ref before pushing it." >&2
        exit 1
    fi
    task_receipt=$(bash "$task_root/scripts/container-check.sh")
    task_mounts=(--mount "type=bind,source=$task_receipt,target=/run/verification/receipt,readonly" --env PIXELBANK_PUSH_RECEIPT=/run/verification/receipt)
fi
run_release_container '' ${task_mounts[@]+"${task_mounts[@]}"} -- git "$@"
