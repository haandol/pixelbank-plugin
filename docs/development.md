# Workspace development and validation

**English** · [한국어](development.ko.md)

Repository-level marketplace and development files wrap one self-contained installation package. A host installs `plugins/pixelbank`, whose MCP commands resolve `${PLUGIN_ROOT}/dist/index.js` or `${CLAUDE_PLUGIN_ROOT}/dist/index.js`. It receives the bundled runtime, skills, tool contracts and notices together.

| Location | Responsibility |
| --- | --- |
| `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json` | Codex and Claude discover `plugins/pixelbank`. |
| `plugins/pixelbank/` | Package manifests, MCP bridge, skills, public contracts and committed `dist/` bundle. |
| `scripts/`, `.github/`, `.devcontainer/` | Workspace validation and the Bun 1.4.2 development/CI environment. |
| `docs/` | Public maintenance documentation. |

## Build and verify

Open the standalone checkout in its Dev Container, or use Bun 1.4.2 locally:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
```

Use the exact version in `.bun-version` for builds and verification. The root `packageManager` declaration, package requirements and Dev Container image agree with it. The customer installation guide includes the command for that version.

`Bun.build` produces the self-contained bundle. `bun test` executes the test suite, including compatible `node:test` APIs; `bun run --bun tsc --noEmit` retains TypeScript checking without a Node executable. Node-compatible imports are Bun APIs in this runtime. Child-process fixtures also launch Bun directly.

Workspace commands run in the package directory. `build` bundles all runtime dependencies, retains dependency notices and records bundle/contract hashes in `dist/build-info.json`. `validate` checks versions, marketplace paths, host manifests, skills, notices and those hashes. `test` exercises signed synthetic identity, private temporary credential stores, scoped creative calls and the actual stdio bundle outside `node_modules`.

CI verifies that Node is absent, then builds and tests in the same Dev Container image without publication credentials. It rejects changed distribution files or lockfile changes after a frozen install and rebuild. Container validation publishes no ports and does not mount account credentials. These fixtures do not establish deployed OAuth, cloud routing or paid image-provider output.

GitHub's dependency graph does not read `bun.lock`, and Dependabot supports only version updates for Bun, so neither reports advisories for transitive packages. The [dependency audit workflow](../.github/workflows/dependency-audit.yml) runs `bun run audit:deps` (`bun audit`) in the same image every Monday at 03:41 UTC and on manual dispatch. It checks every locked package against published advisories without installing dependencies, reports every severity, and fails if an advisory remains or the checkout changes. It is monitoring rather than a push or pull-request check, has only `contents: read`, and cannot detect unpublished vulnerabilities. GitHub notifies the user who last changed the schedule about failed scheduled runs and disables schedules after 60 days without repository activity. To resolve a failure, update the affected dependency or run `bun audit fix`, rebuild, and verify the change normally.


For an explicitly configured isolated server, `PIXELBANK_API_BASE_URL` accepts a loopback discovery base. `PIXELBANK_CREDENTIALS_DIR` and `PIXELBANK_AUTH_SCOPE` isolate test credentials. Keep normal home-directory variables unchanged. Supported production endpoints and account boundaries remain fixed by the client contract.

## Versions and consumer integration

Keep version `0.2.3` synchronized across the root workspace, plugin package, lockfile workspace entry, host manifests and marketplace metadata. Naming and layout corrections do not change the API or require a version bump. The plugin version and API contract version are separate.

A consumer pins an exact repository commit and hashes `plugins/pixelbank/dist/index.js` and `plugins/pixelbank/contracts/tools.json`. Verification must point at the repository root and resolve the package below `plugins/pixelbank`; the package alone remains sufficient for an installed runtime.

Local checks and commits do not authorize publishing. Preserve existing Git hooks and security controls. Pushes and GitHub Releases run only in the release container; follow [Container pushes and versioned releases](releases.md). `bun run check:container` verifies committed source in the Bun image and is the receipt every push requires.
