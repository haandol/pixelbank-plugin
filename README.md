# Pixelbank Plugin

Create and reuse Pixelbank images and animations from Codex or Claude Code, and continue visual selection or layered composition in the Pixelbank web editor. The plugin uses browser sign-in to the existing Pixelbank account.

The installable package is [plugins/pixelbank](plugins/pixelbank/README.md). The repository follows the EncBird Plugin workspace layout: marketplaces at the root select that package, which includes MCP, skills, contracts and a bundled runtime.

## Install from a local checkout

Node.js 24 and a local browser on macOS or Linux are required. The committed bundle includes runtime dependencies; installing the plugin does not require `npm install`.

```sh
codex plugin marketplace add /absolute/path/to/pixelbank-plugin
codex plugin add pixelbank@pixelbank
```

For Claude Code:

```sh
claude plugin marketplace add /absolute/path/to/pixelbank-plugin
claude plugin install pixelbank@pixelbank
```

Use the repository root, not the package subdirectory, as the marketplace path. After publication, `haandol/pixelbank-plugin` can replace the local path. This checkout has not been published; the Pixelbank MCP backend must also be deployed before account connection works.

## Use Pixelbank

Ask “Connect my Pixelbank account,” finish the browser sign-in and return to the conversation. Passwords, tokens and callback URLs never belong in the chat. Account connection and permission to spend credits remain separate.

- Remove backgrounds, run fully specified image operations, upscale images and work with animations.
- Create food-promotion, product-background or banner workflows and continue from the selected result.
- Prepare an owner-only web workspace with images, supported layer settings and a prompt. Opening it does not process images or charge credits.

Space, previsualization and video execution are deferred. See the [plugin usage guide](plugins/pixelbank/README.md) for supported operations, workflow continuity, error recovery and disconnecting.

## Development and notices

[Development documentation](docs/README.md) describes the workspace and verification commands. Public code contains no private service implementation or credentials.

The browser-login and recovery implementation derives from EncBird. See [third-party source notices](THIRD_PARTY_NOTICES.md), [the original EncBird license](LICENSE.encbird) and [bundled dependency licenses](plugins/pixelbank/dist/THIRD_PARTY_LICENSES.txt).
