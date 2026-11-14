# ADR 0001: Bun-based plugin installation and distribution

[한국어](bun-plugin-runtime.ko.md)

Date: 2026-11-07

## Status

Proposed

## Purpose

PixelbankStudio Plugin users need a clear prerequisite before their assistant can start the local MCP connection program. Contributors need to build and verify the same program with one supported JavaScript runtime. The user selected Bun across plugin execution and development, with installation instructions for users who do not have Bun.

This decision owns the independently distributed desktop plugin's runtime and delivery requirements, including which remote and local tools the bridge shows to the assistant. PixelbankStudio's remote service continues to own account permissions, creative processing, credits and the grouped remote tool surface.

Every tool definition the bridge advertises consumes assistant context. The remote service groups its operations into a few tools by authority class and selects an operation with an action. Its workspace and workflow-status reads remain available only so installed bridges keep working; the local workspace opener and bounded workflow wait already cover them. The user selected hiding those two reads from the assistant, so each capability has one model-visible entry point.

## Decision Drivers

- The customer prerequisite and contributor verification environment should use the same runtime family.
- The installed plugin must include its execution dependencies so users can start it after installing the runtime.
- Runtime consolidation must retain the existing authentication, file-safety and release-verification guarantees.
- English and Korean users need equivalent installation and recovery guidance.
- The assistant should see each capability once: the grouped remote tools and the local controls, without raw remote reads that a local tool already wraps.

## Decision

Use Bun for the PixelbankStudio Plugin's desktop execution, dependency preparation, build and verification. A Bun installation is an explicit customer prerequisite. The independently installable package contains the executable bundle, skills, public tool contracts and required notices.

Development and automated verification use the same recorded Bun version. Supported desktop environments remain macOS and Linux. Bun's compatible standard-library APIs may implement the existing MCP and private-file behavior; the runtime choice does not change the remote service's authority.

### Live and published tool contracts and the visible catalog

The authenticated remote catalog is authoritative for current tool availability
and request schemas. The bridge validates supplied arguments against that current
contract before forwarding a call; no schema file grants a capability or a scope.
The package's public tool-contract snapshot supports offline reading and
reproducible releases through the existing manual maintenance process. Automatic
OpenAPI export and cross-repository synchronization are deferred. They are not
required to execute or validate the current workflow tools. Public builds do not
need a private checkout, and no public artifact grants runtime authority.

The bridge forwards the grouped remote tools unchanged, including each tool's
action selector, per-action arguments, annotations and description. It does not
translate, alias or reconstruct former per-operation names. The upload-ticket,
saved-source, workspace-read and workflow-status tools stay internal: the bridge
uses them for local upload, workspace opening and workflow waiting, but never
lists them or forwards a direct call to them. The local connection, upload,
workspace-opening and credit-page controls keep their names and arguments.

The bridge provides a read-only bounded workflow wait when the server advertises
the matching status operation. The wait accepts 1–60 seconds, defaults to 30,
and uses at least 5 seconds between ordinary reads while honoring longer server
delays and retry-after refusals. Wait cancellation or expiry leaves the accepted
server execution running, preserves its identity and returns the latest observed
state. A run that is already finished or not running returns after its first
status read without waiting. The helper follows server timing and never turns a
poll into a write.

The bundled creative-workflow guidance names the grouped tools and their actions,
explains the action-plus-named-arguments calling pattern and keeps each action's
consent cues: quote before paid work, keep the operation key and approved maximum,
confirm deletion only after explicit intent, and follow progress with the wait.

### Requirement contract

#### Installation

| Required guarantee | Observable evidence |
| --- | --- |
| Supported macOS and Linux installations execute the plugin with Bun and require no Node.js installation — approved runtime scope. | The installed plugin starts and completes its existing MCP interactions on a supported machine with Bun and no Node.js. |
| The installed package contains its execution dependencies — existing portable distribution contract. | A package copied outside a developer checkout starts without a separate dependency installation. |
| English and Korean setup guides explain Bun installation when missing, version verification and host executable discovery — explicit user requirement. | Either language leads from a missing runtime to an available executable and usable plugin launch, with reciprocal language navigation. |

#### Verification and publication

| Required guarantee | Observable evidence |
| --- | --- |
| Dependency preparation, type checking, builds and tests execute using Bun, with one recorded verification version — approved tooling scope. | A clean verification environment completes the full checks without an installed Node.js executable. |
| Runtime and artifact changes retain authentication, credential privacy, selected-file safety and supported protocol behavior — existing plugin guarantees. | The existing success and rejection conditions still hold through the installed bundle. |
| Distribution retains third-party notices and verifiable bundle and public-contract integrity — existing release contract. | The distributable includes its required notices, agrees with its recorded integrity information and rebuilds reproducibly. |
| Container verification and source-matching release receipts remain required before publication — existing publication boundary. | An unverified or different source tree remains ineligible for publishing. |

#### Failure guarantees

| Required guarantee | Observable evidence |
| --- | --- |
| A missing Bun runtime is resolved through the documented user installation step; the plugin does not install a runtime automatically or switch runtimes silently. | Missing-runtime startup fails without software installation, credential changes or a fallback process. |
| An incompatible runtime, failed check or changed rebuild prevents a successful verification receipt. | The affected candidate cannot be published as verified until the failure is repaired. |

#### Visible catalog

| Required guarantee | Observable evidence |
| --- | --- |
| The assistant sees the authenticated remote tools, the bounded wait when status is available and the local controls; the upload-ticket, saved-source, workspace-read and workflow-status tools are not listed — approved catalog scope. | A connected catalog lists no internal tool, and still lists the wait whenever the server advertises workflow status. |
| A direct call to an internal tool is refused locally and never reaches the server — approved catalog scope. | Calling an internal tool by name returns an unknown-tool refusal with no remote request, work or charge. |
| Workspace opening and the bounded wait keep working through the hidden remote reads — existing local control contract. | Opening a prepared workspace and waiting for a run each send only their matching internal read. |
| A wait for a run that is already completed, failed or not running returns its latest state immediately — user requirement for hiding status. | Such a wait makes one status read, does not pause and reports why it stopped. |
| The bridge forwards grouped tools and their per-action arguments unchanged and offers no alias for a former per-operation name — remote surface owned by the service. | A grouped call reaches the server with the same action and arguments; a former name is refused locally as unknown. |
| Connection, disconnection, upload, workspace-opening and credit-page controls keep their names and argument rules — existing local control contract. | Those controls accept and reject the same inputs as before. |
| The bundled guidance and public documentation name only advertised grouped tools, actions and local controls, in English and Korean together — existing bilingual documentation contract. | Either language describes the same tools and actions and none of the hidden or former names as callable. |

## Alternatives

### Node.js throughout

The existing runtime and tests already work together. This keeps the established prerequisite but does not meet the user's selected Bun-based execution and development environment.

### Bun execution with Node.js development tools

This limits migration work and retains the current test runner. It requires two runtime environments and leaves installation, build and verification conventions divided.

### Keep the workspace and workflow-status reads visible

The assistant could read a workspace or a run's status directly. Both are already reachable through the local opener and wait, so visible copies add catalog size and a second entry point for the same read. The user selected hiding them.

## Consequences

Customers install Bun before enabling the plugin, and contributors use the same runtime family for development and verification. Bundled distribution keeps dependency preparation with the publisher.

Hiding the workspace and workflow-status reads makes the local opener and wait the only assistant path to them; a server without the status tool offers no wait. Host approvals remembered for former per-operation names stop matching after the remote change, and hosts ask again.

Maintainers must adapt runtime-specific test injection and bundling behavior while preserving the assertions and notices they protect. Bun upgrades require coordinated metadata, documentation and verification updates. Startup time and initial memory are useful observations alongside compatibility and installation friction; they are not acceptance thresholds.

## Related

- [Bun installation](https://bun.sh/docs/installation)
- [Bun Node.js compatibility](https://bun.sh/docs/runtime/nodejs-compat)
