# Pixelbank MCP

Use Pixelbank from Codex or Claude Code, then continue visual selection and layered composition in the Pixelbank web editor. The plugin signs in through the browser using your existing Pixelbank account. It never asks you to copy a password, token or AWS key into a conversation.

This repository contains the public local bridge, installation metadata and creative-workflow skills. The protected remote service is implemented in Pixelbank's private repository. **The new remote service must be deployed before account connection works; this development checkout does not imply a live service.**

## Install and connect

Node.js 24 on macOS or Linux is required. The checked-in `dist/` bundle includes runtime dependencies, so a plugin installation does not need `npm install`.

For Codex:

```sh
codex plugin marketplace add haandol/pixelbank-mcp
codex plugin add pixelbank@pixelbank
```

For Claude Code, run inside the host:

```text
/plugin marketplace add haandol/pixelbank-mcp
/plugin install pixelbank@pixelbank
```

For local development, replace `haandol/pixelbank-mcp` with the absolute checkout path when adding the marketplace.

After installation, run the setup skill or ask, “Connect my Pixelbank account.” Complete sign-in in the browser. The callback listener uses only `http://localhost:18766/oauth/callback`; the remote MCP resource is `https://api.pixelbankstudio.com/mcp`. A server-URL-only connection is not the supported onboarding flow.

Connection approval allows the advertised account operations. Credit spending and destructive asset changes retain their separate consent rules. Ask “Disconnect Pixelbank” to revoke the connection and remove local credentials. If cleanup is pending, follow the returned recovery instruction before treating the connection as disconnected.

## Create and continue in the web editor

The authenticated tool catalog is the authority for current availability and schemas.
The package also includes the generated [tool contracts](contracts/tools.json) for complete request shapes.
The snapshot describes interfaces; the connected server determines which tools are currently available.

| Task | How it works |
| --- | --- |
| Prepare and reuse images | Upload an explicitly selected local PNG, JPEG or WebP; inspect owned assets, previews and original downloads; save inputs and manage selected metadata. |
| Process a specified image | Remove backgrounds, submit complete segmentation or image-generation inputs, quote and submit upscaling, then inspect saved output or job status. |
| Work across creative steps | Start a saved workflow, attach its inputs, perform a supported step, select its output and continue with the acknowledged run revision. |
| Animate and edit visually | Generate and inspect animations, recompose or correct frames, and prepare segmentation or generation workspaces for web editing. |

This release covers image and animation operations and their workflows. Space, previsualization, video import and video generation execution are deferred and unavailable through MCP.

For example:

> Use this product photo to make a promotional banner. Remove its background, prepare a composition with room for copy, and open Pixelbank so I can adjust the layers.

The assistant uploads only the selected file, checks the current price and free uses, and starts the workflow. It prepares an owner-only web link carrying the original images, supported layer settings and draft prompt. Opening the link loads those settings without running image processing or charging credits. Sign in to Pixelbank with the same account to edit them.

After editing, select the result in the workflow and tell the assistant to continue. It reads the same saved run and its permitted next action. Opening or closing a tab does not complete a step. Final acceptance remains explicit.

A preparation is an immutable initial setup, retained until account deletion. Reopening restores that setup; later canvas edits are not autosaved by this feature. New preparations use new operation keys. Stale workflow revisions, missing images and unrelated unsaved work are rejected with recovery instructions. Generation supports at most five named object references, plus composed layers; nonzero layer rotation is currently unsupported.

## Authentication and operation safety

The remote transport supports MCP `2026-07-28` and `2025-11-25`. HTTP authorization follows OAuth 2.1: Authorization Code with PKCE S256, a dedicated public Cognito client, resource-bound access tokens and explicit read/write/execute scopes. Web and MCP credentials have separate authority.

Credentials are stored in owner-only files under `~/.pixelbank-plugin/`, separated by server, machine and host profile. Codex and Claude use separate profiles. Refresh is serialized, refresh tokens rotate, and the grant cannot extend beyond one day from initial sign-in. Do not copy credential files between machines or delete them to bypass pending cleanup.

Billable calls carry the approved credit maximum and one stable operation key. Retries must preserve both and the original request. The bridge does not automatically replay a write after an uncertain outcome. Accepted jobs are reported as accepted until the server reports completion or failure. Quotes and prepared-workspace opening do not consume free uses or credits.

The bridge provides four local tools: `pixelbank_connect`, `pixelbank_disconnect`, `pixelbank_upload_image` and `pixelbank_open_workspace`. Other tools come from the authenticated server. Provider credentials, account administration and checkout are not exposed. Opening a workspace uses the default browser without controlling its active tab.

## Development

```sh
npm ci
npm run typecheck
npm run build
npm test
```

Tests use signed synthetic grants, temporary private credential stores, local HTTP fixtures and injected browser openers. Bundle tests run outside the repository without `node_modules`. They do not establish deployed Cognito, API Gateway or image-provider behavior.

For an explicitly configured isolated server, `PIXELBANK_API_BASE_URL` may be a loopback HTTP discovery base such as `http://localhost:19000/v1/mcp`. Production endpoints are fixed; the plugin rejects arbitrary remote overrides. `PIXELBANK_CREDENTIALS_DIR` and `PIXELBANK_AUTH_SCOPE` can isolate test credential storage. Keep normal home-directory variables unchanged.

The implementation derives its browser-login and recovery approach from EncBird. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [LICENSE.encbird](LICENSE.encbird) and the bundled dependency notices in `dist/THIRD_PARTY_LICENSES.txt`.
