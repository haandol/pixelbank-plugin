---
name: pixelbank-setup
description: Connect PixelbankStudio using browser sign-in after installing the creative-tools plugin.
---

Use the official name PixelbankStudio in customer-facing replies. Support English and Korean, responding in the creator's language while preserving tool identifiers and structured values.

Explain that the connection can read the owner's creative assets and credit information, upload and edit assets, manage workflows and execute approved creative processing. Connection approval is separate from a paid operation or destructive asset action.

When the user wants to connect, call `pixelbank_connect` without credentials. The user completes sign-in in the browser. If authentication is pending, tell the user to finish there and return; check with the same tool after they do. Never request or copy passwords, tokens, callback URLs or AWS configuration into the conversation.

Discover the authenticated creative tools after connection. If the service is not configured, report that failure and its recovery instruction; do not substitute a token, endpoint, account or example data. `pixelbank_disconnect` revokes the connection and clears local credentials. Report completion only when its response says disconnected; preserve pending cleanup and follow same-account recovery when required.
