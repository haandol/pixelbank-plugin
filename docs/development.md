# Workspace development and validation

**English** · [한국어](development.ko.md)

Repository-level marketplace and development files wrap one self-contained installation package. A host installs `plugins/pixelbank`, whose MCP commands resolve `${PLUGIN_ROOT}/dist/index.js` or `${CLAUDE_PLUGIN_ROOT}/dist/index.js`. It receives the bundled runtime, skills, tool contracts and notices together.

| Location | Responsibility |
| --- | --- |
| `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json` | Codex and Claude discover `plugins/pixelbank`. |
| `plugins/pixelbank/` | Package manifests, MCP bridge, skills, public contracts and committed `dist/` bundle. |
| `scripts/`, `.github/`, `.devcontainer/` | Workspace validation and the Node 24 development/CI environment. |
| `docs/` | Public maintenance documentation. |

## Build and verify

Open the standalone checkout in its Dev Container, or use Node.js 24 locally:

```sh
npm ci --ignore-scripts
npm run check
```

Workspace commands run in the package directory. `build` bundles all runtime dependencies, retains dependency notices and records bundle/contract hashes in `dist/build-info.json`. `validate` checks versions, marketplace paths, host manifests, skills, notices and those hashes. `test` exercises signed synthetic identity, private temporary credential stores, scoped creative calls and the actual stdio bundle outside `node_modules`.

CI builds the same Dev Container image and runs these checks without publication credentials. It also rejects a rebuild that changes committed distribution files. Container validation publishes no ports and does not mount account credentials. These fixtures do not establish deployed OAuth, cloud routing or paid image-provider output.

For an explicitly configured isolated server, `PIXELBANK_API_BASE_URL` accepts a loopback discovery base. `PIXELBANK_CREDENTIALS_DIR` and `PIXELBANK_AUTH_SCOPE` isolate test credentials. Keep normal home-directory variables unchanged. Supported production endpoints and account boundaries remain fixed by the client contract.

## Versions and consumer integration

Keep version `0.1.1` synchronized across the root workspace, plugin package, lockfile, host manifests and marketplace metadata. Naming and layout corrections do not change the API or require a version bump. The plugin version and API contract version are separate.

A consumer pins an exact repository commit and hashes `plugins/pixelbank/dist/index.js` and `plugins/pixelbank/contracts/tools.json`. Verification must point at the repository root and resolve the package below `plugins/pixelbank`; the package alone remains sufficient for an installed runtime.

Local checks and commits do not authorize publishing. Preserve existing Git hooks and security controls. Pushes and GitHub Releases run only in the release container; follow [Container pushes and versioned releases](releases.md). `npm run check:container` verifies committed source in the Node image and is the receipt every push requires.
