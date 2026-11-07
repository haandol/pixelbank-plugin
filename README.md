<p align="center">
  <a href="https://www.pixelbankstudio.com">
    <img src="plugins/pixelbank/assets/icon.png" alt="Pixelbank icon" width="112" height="112">
  </a>
</p>

<h1 align="center">Pixelbank Plugin</h1>

Create and reuse Pixelbank images and animations from Codex or Claude Code, and continue visual selection or layered composition in the Pixelbank web editor. The plugin uses browser sign-in to the existing Pixelbank account.

The canonical public repository is [haandol/pixelbank-plugin](https://github.com/haandol/pixelbank-plugin).

The installable package is [plugins/pixelbank](plugins/pixelbank/README.md). The repository follows the EncBird Plugin workspace layout: marketplaces at the root select that package, which includes MCP, skills, contracts and a bundled runtime.

## Install

Node.js 24 and a local browser on macOS or Linux are required. The committed bundle includes runtime dependencies; installing the plugin does not require `npm install`.

```sh
codex plugin marketplace add haandol/pixelbank-plugin
codex plugin add pixelbank@pixelbank
```

For Claude Code:

```sh
claude plugin marketplace add haandol/pixelbank-plugin
claude plugin install pixelbank@pixelbank
```

To install a local checkout, pass the absolute repository root path instead; do not use the package subdirectory. Account connection requires the Pixelbank MCP service. Until it is available, sign-in reports that its configuration could not be loaded.

## Use Pixelbank

Ask “Connect my Pixelbank account,” finish the browser sign-in and return to the conversation. Passwords, tokens and callback URLs never belong in the chat. Account connection and permission to spend credits remain separate.

- Remove backgrounds, run fully specified image operations, upscale images and work with animations.
- Create food-promotion, product-background or banner workflows and continue from the selected result.
- Prepare an owner-only web workspace with images, supported layer settings and a prompt. Opening it does not process images or charge credits.

Space, previsualization and video execution are deferred. See the [plugin usage guide](plugins/pixelbank/README.md) for supported operations, workflow continuity, error recovery and disconnecting.

## Development and notices

[Development documentation](docs/README.md) describes the workspace and verification commands. Public code contains no private service implementation or credentials.

The browser-login and recovery implementation derives from EncBird. See [third-party source notices](THIRD_PARTY_NOTICES.md), [the original EncBird license](LICENSE.encbird) and [bundled dependency licenses](plugins/pixelbank/dist/THIRD_PARTY_LICENSES.txt).
