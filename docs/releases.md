# Container pushes and versioned releases

**English** · [한국어](releases.ko.md)

The public destination is `haandol/pixelbank-plugin`. Every push and GitHub Release runs in the release container built from `.devcontainer/release`. Host pushes are refused by the repository hook. Setup, checks and local commits do not authorize a push or a release.

## Roles

| Step | Where it runs | What it proves |
| --- | --- | --- |
| `bun run check:container` | Bun 1.4.2 verification image (`.devcontainer/Dockerfile`) on a fresh export of the committed `HEAD` | Locked install, the full `bun run check`, and that rebuilding leaves every committed file unchanged. Success writes a receipt keyed by the source tree under the Git common directory. |
| `bash scripts/container-git.sh push …` | Alpine Git/GitHub CLI release image | The pre-push hook compares every pushed tree with the receipt. Only `main` and annotated `vX.Y.Z` tags are accepted; deletions and other refs are refused. |
| `bash scripts/container-release.sh vX.Y.Z` | Same release image, workspace mounted read-only | The remote tag matches the local annotated tag, the commit is on remote `main`, its remote checks succeeded and all manifests declare the version. The ZIP is built from the tagged package only. |

The host relays its GitHub CLI credential to the container over standard input. It is kept in container memory only and answers HTTPS requests for this repository alone. Never put a token in arguments, environment files, images, remote URLs or the workspace. The containers run with a read-only root filesystem, no capabilities and no host credential directories.

## Push `main`

```sh
bun run hooks:install          # once per clone; keeps the existing hook manager
bash scripts/container-git.sh push -u origin main
```

The push re-verifies `HEAD` unless a receipt for the same tree and verification image already exists. Uncommitted, non-ignored changes stop the push. Remote CI runs the same verification image independently.

## Publish a release

1. Keep the version synchronized across the workspace, plugin package, lockfile workspace entry, host manifests and marketplace metadata. `bun run validate` checks it.
2. Push the release commit to `main` and wait for its `verify` check.
3. Create an annotated tag on that commit and push it: `git tag -a v0.2.3 -m "PixelbankStudio Plugin 0.2.3"`, then `bash scripts/container-git.sh push origin v0.2.3`.
4. Write user-visible release notes in both English and Korean in the ignored `.release/notes-v0.2.3.md`. Never include private service implementation, operational data, credentials or user content.
   Then run `bash scripts/container-release.sh v0.2.3`.

The publisher appends the source commit and ZIP SHA-256, uploads `pixelbank-plugin-<version>.zip` and `SHA256SUMS`, and then verifies the public state: not a draft, the expected assets, an anonymously downloaded ZIP matching the tagged source and a public repository. New ZIPs use the tagged commit's timestamp. Verification checks the published checksum and every package path and file's bytes, so older ZIP timestamps do not invalidate unchanged source. Transient download failures are retried. An existing release is verified and never overwritten; a conflicting tag or release stops the workflow.

Marketplace installation selects the repository, not a release tag, so a release does not pin installations. The plugin version and the PixelbankStudio API contract version remain independent.
