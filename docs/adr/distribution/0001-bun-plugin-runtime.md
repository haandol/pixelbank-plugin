# ADR 0001: Bun-based plugin installation and distribution

[한국어](bun-plugin-runtime.ko.md)

Date: 2026-11-07

## Status

Accepted (2026-11-12)

## Purpose

PixelbankStudio Plugin users need a clear prerequisite before their assistant can start the local MCP connection program. Contributors need to build and verify the same program with one supported JavaScript runtime. The user selected Bun across plugin execution and development, with installation instructions for users who do not have Bun.

This decision owns the independently distributed desktop plugin's runtime and delivery requirements. PixelbankStudio's remote service continues to own account permissions, creative processing and credits.

## Decision Drivers

- The customer prerequisite and contributor verification environment should use the same runtime family.
- The installed plugin must include its execution dependencies so users can start it after installing the runtime.
- Runtime consolidation must retain the existing authentication, file-safety and release-verification guarantees.
- English and Korean users need equivalent installation and recovery guidance.

## Decision

Use Bun for the PixelbankStudio Plugin's desktop execution, dependency preparation, build and verification. A Bun installation is an explicit customer prerequisite. The independently installable package contains the executable bundle, skills, public tool contracts and required notices.

Development and automated verification use the same recorded Bun version. Supported desktop environments remain macOS and Linux. Bun's compatible standard-library APIs may implement the existing MCP and private-file behavior; the runtime choice does not change the remote service's authority.

### Live and published tool contracts

The authenticated remote catalog is authoritative for current tool availability
and request schemas. The bridge validates supplied arguments against that current
contract before forwarding a call; no schema file grants a capability or a scope.
The package's public contract snapshot is generated from the service's shared
contracts and supports offline reading and reproducible releases. A local sync
command may read the service's exported public artifact and update only the
packaged public contract. It never imports private source, secrets or user data,
and a stale configured source fails verification rather than publishing a mixed
bundle. Live discovery remains usable when a source checkout is unavailable.

The bridge provides a read-only bounded workflow wait when the server advertises
the matching status operation. The wait accepts 1–60 seconds, defaults to 30,
and uses at least 5 seconds between ordinary reads while honoring longer server
delays and retry-after refusals. Wait cancellation or expiry leaves the accepted
server execution running, preserves its identity and returns the latest observed
state. The helper follows server timing and never turns a poll into a write.

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

## Alternatives

### Node.js throughout

The existing runtime and tests already work together. This keeps the established prerequisite but does not meet the user's selected Bun-based execution and development environment.

### Bun execution with Node.js development tools

This limits migration work and retains the current test runner. It requires two runtime environments and leaves installation, build and verification conventions divided.

## Consequences

Customers install Bun before enabling the plugin, and contributors use the same runtime family for development and verification. Bundled distribution keeps dependency preparation with the publisher.

Maintainers must adapt runtime-specific test injection and bundling behavior while preserving the assertions and notices they protect. Bun upgrades require coordinated metadata, documentation and verification updates. Startup time and initial memory are useful observations alongside compatibility and installation friction; they are not acceptance thresholds.

## Related

- [Bun installation](https://bun.sh/docs/installation)
- [Bun Node.js compatibility](https://bun.sh/docs/runtime/nodejs-compat)
