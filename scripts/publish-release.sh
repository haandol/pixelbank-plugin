#!/usr/bin/env bash
# Runs inside the release container: publish one verified version tag as a GitHub Release.
set -euo pipefail
task_tag=${1:?version tag required}
task_repository=haandol/pixelbank-plugin
reject() { printf '%s\n' "$1" >&2; exit 1; }
[[ "$task_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || reject 'Use a vX.Y.Z version tag.'
[[ -s /run/credentials/github-token ]] || reject 'The release container has no GitHub credential.'
GH_TOKEN=$(cat /run/credentials/github-token)
export GH_TOKEN
task_version=${task_tag#v}
task_notes_source="/workspace/.release/notes-$task_tag.md"
[[ -s "$task_notes_source" ]] || reject "Write the English and Korean release notes in .release/notes-$task_tag.md first."

# The local annotated tag, the remote tag and the source version must agree.
[[ "$(git cat-file -t "refs/tags/$task_tag")" == tag ]] || reject "$task_tag must be a local annotated tag."
task_tag_object=$(git rev-parse "refs/tags/$task_tag")
task_commit=$(git rev-parse "$task_tag^{commit}")
task_remote_tag=$(gh api "repos/$task_repository/git/ref/tags/$task_tag" --jq '.object.sha' 2>/dev/null || true)
[[ "$task_remote_tag" == "$task_tag_object" ]] || reject "Push $task_tag through scripts/container-git.sh before publishing."
for task_manifest in package.json plugins/pixelbank/package.json plugins/pixelbank/plugin.json plugins/pixelbank/.claude-plugin/plugin.json plugins/pixelbank/.codex-plugin/plugin.json; do
    [[ "$(git show "$task_commit:$task_manifest" | jq -r .version)" == "$task_version" ]] || reject "$task_manifest does not declare $task_version."
done
task_relation=$(gh api "repos/$task_repository/compare/$task_commit...main" --jq .status)
[[ "$task_relation" == identical || "$task_relation" == ahead ]] || reject "$task_commit is not on remote main."

# Remote CI for the exact commit must have completed successfully.
for task_attempt in $(seq 1 60); do
    task_runs=$(gh api "repos/$task_repository/commits/$task_commit/check-runs" --jq '[.check_runs[] | {name, status, conclusion}]')
    task_pending=$(jq '[.[] | select(.status != "completed")] | length' <<<"$task_runs")
    task_total=$(jq 'length' <<<"$task_runs")
    if [[ "$task_total" -gt 0 && "$task_pending" -eq 0 ]]; then break; fi
    [[ "$task_attempt" -lt 60 ]] || reject 'Remote checks did not complete in time.'
    sleep 15
done
jq -e 'any(.[]; .name == "verify" and .conclusion == "success") and all(.[]; .conclusion == "success" or .conclusion == "skipped" or .conclusion == "neutral")' <<<"$task_runs" >/dev/null ||
    reject "Remote checks for $task_commit did not all succeed: $task_runs"

# Assets come from the tagged commit's installable package only.
task_out=/tmp/release
mkdir -p "$task_out"
task_zip="pixelbank-plugin-$task_version.zip"
git archive --format=zip --prefix=pixelbank/ -o "$task_out/$task_zip" "$task_commit:plugins/pixelbank"
(cd "$task_out" && sha256sum "$task_zip" > SHA256SUMS)
task_zip_sha=$(cut -d' ' -f1 "$task_out/SHA256SUMS")
{
    cat "$task_notes_source"
    printf '\nSource commit: %s\n\nZIP SHA-256: %s\n' "$task_commit" "$task_zip_sha"
} > "$task_out/notes.md"

verify_published() {
    local state url downloaded
    state=$(gh release view "$task_tag" -R "$task_repository" --json isDraft,isPrerelease,tagName,assets)
    jq -e --arg tag "$task_tag" --arg zip "$task_zip" '.isDraft == false and .tagName == $tag and ([.assets[].name] | sort) == ([$zip, "SHA256SUMS"] | sort)' <<<"$state" >/dev/null ||
        reject "The published release does not match the expected tag and assets: $state"
    url=$(jq -r --arg zip "$task_zip" '.assets[] | select(.name == $zip) | .url' <<<"$state")
    downloaded=$(curl -fsSL --proto '=https' "$url" | sha256sum | cut -d' ' -f1)
    [[ "$downloaded" == "$task_zip_sha" ]] || reject 'The public release ZIP does not match the tagged source.'
    [[ "$(gh repo view "$task_repository" --json visibility --jq .visibility)" == PUBLIC ]] || reject 'The release repository is not public.'
}

if gh release view "$task_tag" -R "$task_repository" >/dev/null 2>&1; then
    printf '%s\n' "$task_tag already exists; verifying it without overwriting." >&2
    verify_published
else
    gh release create "$task_tag" -R "$task_repository" --verify-tag \
        --title "PixelbankStudio Plugin $task_version" --notes-file "$task_out/notes.md" \
        "$task_out/$task_zip" "$task_out/SHA256SUMS" >&2
    verify_published
fi
printf 'Published %s at %s (ZIP SHA-256 %s)\n' "$task_tag" "$task_commit" "$task_zip_sha"
