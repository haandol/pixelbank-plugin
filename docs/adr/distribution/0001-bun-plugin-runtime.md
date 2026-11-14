# ADR 0001: Bun-based plugin installation and distribution

[한국어](bun-plugin-runtime.ko.md)

Date: 2026-11-07

## Status

Proposed

## Purpose

PixelbankStudio Plugin users need a clear prerequisite before their assistant can start the local MCP connection program. Contributors need to build and verify the same program with one supported JavaScript runtime. The user selected Bun across plugin execution and development, with installation instructions for users who do not have Bun.

This decision owns the independently distributed desktop plugin's runtime and delivery requirements, including which remote and local tools the bridge shows to the assistant. PixelbankStudio's remote service continues to own account permissions, creative processing, credits and the grouped remote tool surface.

Every tool definition the bridge advertises consumes assistant context, and hosts grant approvals and read-only or destructive treatment per tool rather than per argument. The remote service groups its operations into four tools by authority class, selects an operation with an action and returns an operation's exact arguments on request. The user selected a catalog of exactly five PixelbankStudio tools: those four and one local connection tool. Operations that need the local machine join the remote tool of their class instead of adding tools, so each capability has one model-visible entry point and keeps its class's approval.

## Decision Drivers

- The customer prerequisite and contributor verification environment should use the same runtime family.
- The installed plugin must include its execution dependencies so users can start it after installing the runtime.
- Runtime consolidation must retain the existing authentication, file-safety and release-verification guarantees.
- English and Korean users need equivalent installation and recovery guidance.
- The assistant should see each capability once, in a catalog of five tools whose authority classes hosts can approve separately.
- An assistant should be able to tell an argument refusal, where nothing started and a corrected resend is safe, from an outcome where a write may already have taken effect.

## Decision

Use Bun for the PixelbankStudio Plugin's desktop execution, dependency preparation, build and verification. A Bun installation is an explicit customer prerequisite. The independently installable package contains the executable bundle, skills, public tool contracts and required notices.

Development and automated verification use the same recorded Bun version. Supported desktop environments remain macOS and Linux. Bun's compatible standard-library APIs may implement the existing MCP and private-file behavior; the runtime choice does not change the remote service's authority.

### Live and published tool contracts and the visible catalog

The authenticated remote catalog is authoritative for current tool availability
and request schemas. The bridge validates supplied arguments against the current
advertised outline before forwarding a call, and the service validates each action
against its exact schema; no schema file grants a capability or a scope.
The package's public tool-contract snapshot supports offline reading and
reproducible releases through the existing manual maintenance process. Automatic
OpenAPI export and cross-repository synchronization are deferred. They are not
required to execute or validate the current workflow tools. Public builds do not
need a private checkout, and no public artifact grants runtime authority.

The assistant sees exactly five PixelbankStudio tools: the remote read, edit,
delete and run tools, one per authority class, and the local connection tool,
whose actions connect, disconnect and open the credit page. The bridge forwards
each remote tool's annotations, description, action list and argument outline,
and adds the local operations to the remote tool of their class: waiting for a
workflow run and opening a prepared workspace join the read tool, and uploading
one selected local image joins the edit tool. A local action appears in that
tool's action list with its own short argument outline, keeps the tool's
annotations, runs in the bridge and is never forwarded. A local action is added
only while its remote tool and the internal read it needs are advertised, and a
remote catalog that already contains a local tool or action name is rejected.

Remote actions are forwarded with their action and arguments unchanged. The
bridge does not translate, alias or reconstruct former tool names. A former
per-operation, never-released intermediate grouped or local tool name is refused
locally as retired, naming its current tool, and its action when the current
catalog provides it; any other unknown name is refused as unknown. Neither
reaches the server. The upload-ticket, saved-source, workspace-read and
workflow-status tools stay internal: the bridge uses them for local upload,
workspace opening and workflow waiting, but never lists them or forwards a
direct call to them, which is refused like a former name with its replacement
action.

The read tool's describe operation is answered by the bridge for a local action:
it returns that action's exact argument schema, required fields and authority
without a remote request. Describing a remote action is forwarded unchanged.
Describing without an action forwards the request and adds a one-line summary of
each advertised local action and connection action to the server's list, so one
listing covers every action of all five tools. Describing a connection action is
also answered locally, and describing describe itself adds these actions to the
list of actions it accepts.

An argument refusal states that nothing started and that the corrected call can
be sent again. The service reports such refusals as INVALID_ARGUMENTS with the
failing argument location and the tool and action; the bridge keeps those hints
when they are well formed and uses the same code for its own refusal of a local
action's arguments. A domain refusal reported as INVALID_INPUT, and any other
unclassified refusal, keeps the guidance that a write may already have taken
effect and must be checked before an explicit retry.

The bridge provides a read-only bounded workflow wait when the server advertises
the matching status operation. The wait accepts 1–60 seconds, defaults to 30,
and uses at least 5 seconds between ordinary reads while honoring longer server
delays and retry-after refusals. Wait cancellation or expiry leaves the accepted
server execution running, preserves its identity and returns the latest observed
state. A run that is already finished or not running returns after its first
status read without waiting. The helper follows server timing and never turns a
poll into a write.

The bundled creative-workflow guidance names the five tools and their actions,
explains the action-plus-arguments calling pattern and describe-before-call,
and keeps each action's consent cues: quote before paid work, keep the operation
key and approved maximum, confirm deletion only after explicit intent, and follow
progress with the wait.

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
| A connected catalog lists exactly five PixelbankStudio tools: the remote read, edit, delete and run tools and the local connection tool — approved catalog scope. | A connected catalog with all four remote tools lists those five names and no other PixelbankStudio tool. |
| Without a connection the catalog lists only the local connection tool and makes no remote request — existing connection boundary. | A disconnected catalog lists the connection tool alone and sends nothing to the service. |
| The connection tool's actions are connect, disconnect and open the credit page, each taking no other argument — approved local tool set. | Each action runs with the action alone; any extra argument, credential or URL is refused before any sign-in, revocation or page opening. |
| Waiting and workspace opening appear as read-tool actions and image upload as an edit-tool action, each with its outline, only while its remote tool and internal read are advertised — approved class placement. | The read tool lists the wait whenever workflow status is available and the edit tool lists upload whenever upload tickets are available; neither appears otherwise. |
| A local action runs in the bridge and is never forwarded as a remote action — local operation boundary. | Waiting, workspace opening and uploading send only their matching internal reads or upload requests, never a remote call naming the local action. |
| A remote catalog cannot replace or shadow a local tool or action — trusted local control. | A catalog that already contains the connection tool or a local action name is rejected and no remote call is made. |
| The upload-ticket, saved-source, workspace-read and workflow-status tools are not listed, and a direct call to one is refused locally — approved catalog scope. | Calling an internal tool by name returns a retired-tool refusal naming its replacement action, with no remote request, work or charge. |
| A wait for a run that is already completed, failed or not running returns its latest state immediately — user requirement for hiding status. | Such a wait makes one status read, does not pause and reports why it stopped. |
| Remote actions are forwarded with their action and arguments unchanged — remote surface owned by the service. | A remote action call reaches the server with the same tool, action and arguments. |
| A former tool name is refused locally as retired, with its current tool and action when known, and is never an alias — approved retirement. | Calling a former local, per-operation or intermediate grouped name returns a retired-tool refusal naming the replacement and no remote request. |
| Describing a local action is answered locally with its exact argument schema and authority — approved on-demand schema. | Such a describe makes no remote request and returns the same schema the bridge enforces for that action. |
| Describing without an action lists every action of all five tools with a one-line summary — approved on-demand schema. | The listing contains the service's actions and each advertised local action, and changes nothing. |
| An argument refusal says nothing started and keeps its location, tool and action hints, while a domain refusal keeps the possible-write guidance — approved refusal distinction. | An INVALID_ARGUMENTS refusal invites a corrected resend; an INVALID_INPUT refusal warns that a write may already have taken effect. |
| The bundled guidance and public documentation name only the five tools, their actions and the local actions, in English and Korean together — existing bilingual documentation contract. | Either language describes the same tools and actions and none of the hidden or former names as callable. |

## Alternatives

### Node.js throughout

The existing runtime and tests already work together. This keeps the established prerequisite but does not meet the user's selected Bun-based execution and development environment.

### Bun execution with Node.js development tools

This limits migration work and retains the current test runner. It requires two runtime environments and leaves installation, build and verification conventions divided.

### Keep the workspace and workflow-status reads visible

The assistant could read a workspace or a run's status directly. Both are already reachable through the local opener and wait, so visible copies add catalog size and a second entry point for the same read. The user selected hiding them.

### Separate local tools for each local operation

Connection, upload, workspace opening, waiting and the credit page were separate tools. Each added a definition to the assistant's context and an approval decision outside its authority class. Adding the operations to the remote tool of their class keeps five tools and lets a host approve reads, edits and the connection separately.

## Consequences

Customers install Bun before enabling the plugin, and contributors use the same runtime family for development and verification. Bundled distribution keeps dependency preparation with the publisher.

Hiding the workspace and workflow-status reads makes the local wait and opener the only assistant path to them; a server without the status tool offers no wait. Host approvals remembered for former tool names, including the former local controls, stop matching after the change, and hosts ask again. Approving the read tool also approves waiting and workspace opening, and approving the edit tool also approves uploading a selected file. The bridge depends on the service's describe listing and action-list shape to add local actions; a service change to them requires a coordinated bridge release.

Maintainers must adapt runtime-specific test injection and bundling behavior while preserving the assertions and notices they protect. Bun upgrades require coordinated metadata, documentation and verification updates. Startup time and initial memory are useful observations alongside compatibility and installation friction; they are not acceptance thresholds.

## Related

- [Bun installation](https://bun.sh/docs/installation)
- [Bun Node.js compatibility](https://bun.sh/docs/runtime/nodejs-compat)
