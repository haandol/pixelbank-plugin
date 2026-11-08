#!/usr/bin/env bash
# Verify tagged package paths and bytes without trusting ZIP timestamps or extracting files.
set -euo pipefail
task_commit=${1:?source commit required}
task_zip=${2:?package ZIP required}
task_tree=$(git rev-parse "$task_commit:plugins/pixelbank")
task_work=$(mktemp -d)
trap 'rm -rf "$task_work"' EXIT

printf '%s\n' 'pixelbank/' > "$task_work/expected"
git ls-tree -rtz "$task_tree" > "$task_work/tree"
while IFS= read -r -d '' task_entry; do
    task_meta=${task_entry%%$'\t'*}
    task_path=${task_entry#*$'\t'}
    read -r task_mode task_type task_object <<< "$task_meta"
    if [[ "$task_type" == tree ]]; then
        printf 'pixelbank/%s/\n' "$task_path"
    else
        [[ "$task_type" == blob ]] || { printf '%s\n' 'Unsupported package entry.' >&2; exit 1; }
        printf 'pixelbank/%s\n' "$task_path"
    fi
done < "$task_work/tree" >> "$task_work/expected"
unzip -Z1 "$task_zip" > "$task_work/actual"
LC_ALL=C sort "$task_work/expected" > "$task_work/expected-sorted"
LC_ALL=C sort "$task_work/actual" > "$task_work/actual-sorted"
cmp -s "$task_work/expected-sorted" "$task_work/actual-sorted" || { printf '%s\n' 'Package paths differ from tagged source.' >&2; exit 1; }

while IFS= read -r -d '' task_entry; do
    task_meta=${task_entry%%$'\t'*}
    task_path=${task_entry#*$'\t'}
    read -r task_mode task_type task_object <<< "$task_meta"
    [[ "$task_type" == blob ]] || continue
    task_actual=$(unzip -p "$task_zip" "pixelbank/$task_path" | git hash-object --stdin)
    [[ "$task_actual" == "$task_object" ]] || { printf 'Package bytes differ: %s\n' "$task_path" >&2; exit 1; }
done < "$task_work/tree"
printf '%s\n' 'Verified tagged package contents.'
