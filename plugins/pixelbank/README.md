<p align="center">
  <a href="https://www.pixelbankstudio.com">
    <img src="assets/icon.png" alt="PixelbankStudio icon" width="112" height="112">
  </a>
</p>

<h1 align="center">PixelbankStudio Plugin</h1>

<p align="center"><strong>English</strong> · <a href="README.ko.md">한국어</a></p>

Use PixelbankStudio from Codex or Claude Code, then continue visual selection and layered composition in the PixelbankStudio web editor. The plugin signs in through the browser using your existing PixelbankStudio account. It never asks you to copy a password, token or AWS key into a conversation.

For a quick introduction and real output examples, see the [repository overview](https://github.com/haandol/pixelbank-plugin#examples). This guide covers supported inputs, workflow continuity and connection recovery.

## Install and connect

Bun 1.4.2 or newer on macOS or Linux is required. The checked-in `dist/` bundle includes execution dependencies; users only need the Bun runtime and the plugin package.

### Install Bun if needed

Check your installed version:

```sh
bun --version
```

If Bun is missing or older than 1.4.2, install the verified version with the [official installer](https://bun.sh/docs/installation):

```sh
curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"
```

Linux needs `unzip` for the installer. Open a new terminal and run `bun --version` again, then restart Codex or Claude Code so it can find Bun.

If the assistant still cannot find Bun, run `command -v bun` in the new terminal and launch the CLI host there. For a manually configured MCP server, its command can use that absolute executable path.

### Install the plugin

For Codex:

```sh
codex plugin marketplace add haandol/pixelbank-plugin
codex plugin add pixelbank@pixelbank
```

For Claude Code, run inside the host:

```text
/plugin marketplace add haandol/pixelbank-plugin
/plugin install pixelbank@pixelbank
```

For a local checkout, replace `haandol/pixelbank-plugin` with the absolute repository root path, not the package subdirectory.

After installation, run the setup skill or ask, “Connect my PixelbankStudio account.” Complete sign-in in the browser. The callback listener uses only `http://localhost:18766/oauth/callback`; the remote MCP resource is `https://api.pixelbankstudio.com/mcp`. A server-URL-only connection is not the supported onboarding flow.

Connection approval allows the advertised account operations. Credit spending and destructive asset changes retain their separate consent rules. Ask “Disconnect PixelbankStudio” to revoke the connection and remove local credentials. If cleanup is pending, follow the returned recovery instruction before treating the connection as disconnected.

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

> Use this product photo to make a promotional banner. Remove its background, prepare a composition with room for copy, and open PixelbankStudio so I can adjust the layers.

The assistant uploads only the selected file, checks the current price and free uses, and starts the workflow. It prepares an owner-only web link carrying the original images, supported layer settings and draft prompt. Opening the link loads those settings without running image processing or charging credits. Sign in to PixelbankStudio with the same account to edit them.

After editing, select the result in the workflow and tell the assistant to continue. It reads the same saved run and its permitted next action. Opening or closing a tab does not complete a step. Final acceptance remains explicit.

A preparation is an immutable initial setup, retained until account deletion. Reopening restores that setup; later canvas edits are not autosaved by this feature. New preparations use new operation keys. Stale workflow revisions, missing images and unrelated unsaved work are rejected with recovery instructions. Generation supports at most five named object references, plus composed layers; nonzero layer rotation is currently unsupported.

## Authentication and operation safety

The remote transport supports MCP `2026-07-28` and `2025-11-25`. HTTP authorization follows OAuth 2.1: Authorization Code with PKCE S256, a dedicated public Cognito client, resource-bound access tokens and explicit read/write/execute scopes. Web and MCP credentials have separate authority.

Credentials are stored in owner-only files under `~/.pixelbank-plugin/`, separated by server, machine and host profile. Codex and Claude use separate profiles. Refresh is serialized, refresh tokens rotate, and the grant cannot extend beyond one day from initial sign-in. Do not copy credential files between machines or delete them to bypass pending cleanup.

Billable calls carry the approved credit maximum and one stable operation key. Retries must preserve both and the original request. The bridge does not automatically replay a write after an uncertain outcome. Accepted jobs are reported as accepted until the server reports completion or failure. Quotes and prepared-workspace opening do not consume free uses or credits.

The bridge provides four local tools: `pixelbank_connect`, `pixelbank_disconnect`, `pixelbank_upload_image` and `pixelbank_open_workspace`. Other tools come from the authenticated server. Provider credentials, account administration and checkout are not exposed. Opening a workspace uses the default browser without controlling its active tab.

## More information

See the [project documentation](https://github.com/haandol/pixelbank-plugin/tree/main/docs) for development and maintenance.
