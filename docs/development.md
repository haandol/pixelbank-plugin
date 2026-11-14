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

### Live catalog and generated contracts

The bridge refreshes authenticated `tools/list` before forwarding a remote call and validates arguments against that schema. A new API field does not require a second handwritten plugin schema. Only explicitly exposed remote tools can be called; OpenAPI never enables arbitrary endpoints.

The package contains a manually maintained public tool snapshot for offline reading and reproducible builds. Automatic OpenAPI export and repository synchronization are deferred; live validation and workflow execution remain available independently. Maintainers update the tool snapshot explicitly alongside a compatible service change and run the existing interoperability checks.

### Five tools, local actions and internal reads

The server groups its operations into four tools by authority class: reads, plain edits, deletion and billable processing never share one tool. A tool call takes a required `action` and that action's arguments in one `arguments` object; billable actions keep `operation_key`, `maximum_credits` and the optional paid-fallback and workflow context inside it. Each advertised tool carries only its action enum and a short outline in its description; the read action `describe` returns an action's exact schema, consent fields and authority, and lists every action without arguments.

The bridge adds `pixelbank_connection` (`connect`, `disconnect`, `open_credits_page`) and injects its local actions into the remote tool of their class: `wait_for_workflow` and `open_workspace` into `pixelbank_read`, `upload_image` into `pixelbank_edit`. Injection appends the action to the enum and a `name{fields}` outline to the description, only while the remote tool and the internal read it needs are advertised. A remote catalog that already contains the connection tool, a former local tool name or a local action name is rejected as `INVALID_CATALOG`. The bridge answers `describe` for a local action itself and appends local actions to the server's full listing.

`pixelbank_issue_upload`, `pixelbank_save_source`, `pixelbank_get_workspace` and `pixelbank_get_workflow_status` stay in the remote catalog unchanged for installed bridges but are never listed to the model. The local actions call them by exact name; a direct call is refused locally and names the replacement action. Former tool names are refused locally as `TOOL_RETIRED` with a `replacement` tool and action when the bridge can derive it, and other unknown names as `UNKNOWN_TOOL`.

Refusals that happen before any work, `INVALID_ARGUMENTS` (with `location`, `problem`, `tool` and `action` hints) and `INVALID_ACTION` (with the tool's `actions`), tell the model to correct and resend. The bridge uses the same codes for its own pre-flight refusals. A domain `INVALID_INPUT` and any unclassified refusal keep the possible-write guidance, because the service may already have stored part of the request.

### Bounded workflow progress

When the remote catalog exposes the hidden `pixelbank_get_workflow_status`, the bridge adds the `pixelbank_read` action `wait_for_workflow`. It inherits the live status arguments and adds `max_wait_seconds` (1–60, default 30). Status requests wait at least 5 seconds, follow larger server delays and back off when the revision is unchanged. A retry-after refusal is returned unchanged. A run that is already completed, failed or not running returns after its first read without pausing; expiry and cancellation leave the accepted server execution running.

### Version and artifact identity

Keep version `0.3.0` synchronized across the root workspace, plugin package, lockfile workspace entry, host manifests and marketplace metadata. Naming and layout corrections do not change the API or require a version bump. The plugin version and API contract version are separate.

Release verification tests use Git and unzip, both provided by the Dev Container and verification images.

A consumer pins an exact repository commit and hashes the bundle and tool snapshot. Verification must point at the repository root and resolve the package below `plugins/pixelbank`; the package alone remains sufficient for an installed runtime.

Local checks and commits do not authorize publishing. Preserve existing Git hooks and security controls. Pushes and GitHub Releases run only in the release container; follow [Container pushes and versioned releases](releases.md). `bun run check:container` verifies committed source in the Bun image and is the receipt every push requires.
