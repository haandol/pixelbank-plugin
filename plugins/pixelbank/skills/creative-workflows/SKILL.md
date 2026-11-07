---
name: pixelbank-creative-workflows
description: Create and reuse PixelbankStudio images and workflows through MCP, handing visual selection and layered composition to a prepared PixelbankStudio web workspace.
---

Use the official name PixelbankStudio in customer-facing replies. Support English and Korean, responding in the creator's language while preserving tool identifiers and structured values.

Use PixelbankStudio's authenticated tools for the creator's task. Read the current tool catalog and account state before relying on availability, price or free uses. Use only tools actually advertised by the service.

This release supports images, animation and their workflows. Space, previsualization, video import and video generation execution are unavailable through MCP. Do not route those requests through another tool or an arbitrary API call.

For a complex request shape, consult the packaged [tool contracts](../../contracts/tools.json) when the host has shortened the tool schema. The connected server's schema and availability take precedence. Preserve complete upload references returned by the helper; never invent their keys or checksums.

## Choose a creative workflow

For a multi-step result, use a saved workflow rather than treating its steps as unrelated jobs. Food promotion and product background replacement prepare a cutout, compose an image and select a final result. Banner preparation composes, optionally upscales and selects a result. Create the requested definition once and preserve its run ID. A direct request such as background removal can use the basic tool without creating a workflow.

Every workflow action retains its action ID and the acknowledged revision. Read the current run before choosing the next permitted action. Use an existing prepared asset when the workflow permits it. Never treat a page opening, preview, poll or tab closing as a completed step. Final acceptance comes from the creator.

## Prepare images and cost authority

Upload only files the user selected. `pixelbank_upload_image` reads a local PNG, JPEG or WebP and uses the purpose-bound direct-upload ticket. Match the purpose to the processing tool. For persistent web-workspace sources, use `workflow-input` with `save_source: true`; retain the returned stable asset reference. Preserve originals when preparing an input copy for the tool's documented size limit.

Read current prices and free uses. Explain the processing outcome and cost before submission, honoring the account's existing explicit credit-auto-confirm opt-in. Use a zero maximum when only a free use is authorized. A paid operation carries the approved maximum credits and one stable operation key. A free-use lookup failure requires separate consent for the exact paid fallback amount even when auto-confirm is enabled. Insufficient balance is not permission to change funding or repeat the call.

For retries, retain the complete original request, operation key, budget and workflow context. An unknown outcome is not a failed job. Recover the original job or existing result; do not create a new key to repeat a possibly accepted operation. A new intentional generation using identical inputs still needs the existing duplicate-submission confirmation.

## Continue visual editing in PixelbankStudio

Background removal and other fully specified operations can run directly. Interactive segmentation and layered image composition use the PixelbankStudio web editor when visual control is needed. Do not imply that a plain prompt recreates an unprovided selection mask or composition.

Prepare the workspace with owned asset references and the agreed settings. Generation preparation can carry ordered images, layer/object roles, names, normalized position/size, visibility, locks, canvas framing and the draft prompt. Use the current supported schema; the web editor currently does not support nonzero layer rotation. An object reference requires its name, and at most five object references are accepted. Ordinary composed layers do not spend that reference budget.

Bind preparation to the current workflow run, step and revision when it belongs to a workflow. Every prepared source must already belong to that run, and the selected step inputs must remain included. Attach an additional owned source through the workflow action first, then use the returned revision. Call `pixelbank_open_workspace` with the returned workspace ID when the user wants to open it, and retain the returned URL. Opening loads initial settings without processing or charging. Subsequent browser edits are not autosaved by the handoff record. Do not replace unrelated unsaved work.

When the creator returns from the web editor, inspect the same workflow and the result they selected. Continue with its permitted next action. A stale preparation, changed run or deleted source requires reconciliation from current acknowledged state; do not overwrite a newer choice or fabricate completion.

## Preserve results and ownership

Report accepted jobs separately from completed output. Use job status to obtain the saved result or actual final failure. Return useful previews and original download references, and keep source and workflow provenance intact. Do not claim a refund before the service reports it.

Update or delete only the assets explicitly covered by the user's request. Reuse permission already provided for those exact targets. A workflow association is distinct from the global asset: detaching from a workflow must not become a global library deletion. Never call checkout, credit-grant, account-deletion or administrative actions through this integration.
