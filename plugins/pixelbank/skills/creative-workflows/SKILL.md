---
name: pixelbank-creative-workflows
description: Create and reuse PixelbankStudio images and workflows through MCP, handing visual selection and layered composition to a prepared PixelbankStudio web workspace.
---

Use the official name PixelbankStudio in customer-facing replies. Support English and Korean, responding in the creator's language while preserving tool identifiers and structured values.

Use PixelbankStudio's authenticated tools for the creator's task. Read the current tool catalog and account state before relying on availability, price or free uses. Use only tools actually advertised by the service.

This release supports images, animation and their workflows. Space, previsualization, video import and video generation execution are unavailable through MCP. Do not route those requests through another tool or an arbitrary API call.

For a complex request shape, consult the packaged [tool contracts](../../contracts/tools.json) when the host has shortened the tool schema. The connected server's schema and availability take precedence. Preserve complete upload references returned by the helper; never invent their keys or checksums.

## Choose a creative workflow

For a multi-step result, discover supported definitions and create the requested workflow once. Supply its required inputs and preserve the run ID and acknowledged revision. Quote the selected plan, obtain its required bounded cost authority, and call `pixelbank_execute_workflow` once with the original action ID and quoted maximum. Automatic workflows choose their declared preparation path and save final results in the normal library without intermediate user actions. A direct request such as background removal can use the basic tool without creating a workflow.

For an accepted execution, use `pixelbank_get_workflow_status` or the bounded `pixelbank_wait_for_workflow` helper. Follow the returned poll delay and stop on completed or failed state. Wait cancellation or expiry does not cancel the server execution. Do not require metadata confirmation, manual box drawing, per-step continuation or final acceptance. A failed execution preserves its history and saved assets; a new execution needs the creator's retry intent.

Earlier guided runs retain their captured action and selection rules. Every such action keeps its action ID and acknowledged revision. A page opening, preview, poll or tab closing is not a completed step. Do not apply guided actions to an active automatic execution.

## Prepare images and cost authority

Upload only files the user selected. `pixelbank_upload_image` reads a local PNG, JPEG or WebP and uses the purpose-bound direct-upload ticket. Match the purpose to the processing tool. For persistent web-workspace sources, use `workflow-input` with `save_source: true`; retain the returned stable asset reference. Preserve originals when preparing an input copy for the tool's documented size limit.

Read current prices and free uses. Explain the processing outcome and cost before submission, honoring the account's existing explicit credit-auto-confirm opt-in. Use a zero maximum when only a free use is authorized. A paid operation carries the approved maximum credits and one stable operation key. A free-use lookup failure requires separate consent for the exact paid fallback amount even when auto-confirm is enabled. Insufficient balance is not permission to change funding or repeat the call.

When the selected task cannot be funded after eligible free uses, explain the shortage in the creator's language, show a clickable [PixelbankStudio credit page](https://www.pixelbankstudio.com/pricing), and call `pixelbank_open_credits_page` before submitting processing. A `NOT_ENOUGH_CREDIT` response has already attempted to open that page: show its `credits_url` link and use `credits_page_opened` to describe the outcome without opening it again. The creator chooses a credit package and completes payment on the website. When they ask to continue, re-read the account and any required quote, reconcile the original outcome, and preserve the original operation key and approved authority.

A zero balance with an eligible free use is not a credit shortage. `FREE_TRIAL_UNAVAILABLE`, `CREDIT_PRICE_CHANGED` and `MCP_APPROVAL_INVALID` retain their separate consent or quote guidance. Page opening does not confirm purchase or authorize another processing call.

For retries, retain the complete original request, operation key, budget and workflow context. An unknown outcome is not a failed job. Recover the original job or existing result; do not create a new key to repeat a possibly accepted operation. A new intentional generation using identical inputs still needs the existing duplicate-submission confirmation.

## Continue visual editing in PixelbankStudio

Background removal and other fully specified operations can run directly. Interactive segmentation and layered image composition use the PixelbankStudio web editor when visual control is needed. Do not imply that a plain prompt recreates an unprovided selection mask or composition.

Prepare the workspace with owned asset references and the agreed settings. Generation preparation can carry ordered images, layer/object roles, names, normalized position/size, visibility, locks, canvas framing and the draft prompt. Use the current supported schema; the web editor currently does not support nonzero layer rotation. An object reference requires its name, and at most five object references are accepted. Ordinary composed layers do not spend that reference budget.

For additional edits to automatic results, prepare a standalone expert workspace from the saved library image, without a workflow execution context. Bind preparation to the current run, step and revision only for a legacy guided workflow. For that guided context, every prepared source must already belong to the run, and the selected step inputs must remain included; attach any additional owned source first and use the returned revision. Call `pixelbank_open_workspace` with the returned workspace ID when the user wants to open it, and retain the returned URL. Opening loads initial settings without processing or charging. Subsequent browser edits are not autosaved by the handoff record. Do not replace unrelated unsaved work.

When the creator returns from a guided workflow's web editor, inspect the same run and selected result, then continue with its permitted next action. A standalone expert edit leaves its original automatic workflow complete. A stale preparation, changed run or deleted source requires reconciliation from current acknowledged state; do not overwrite a newer choice or fabricate completion.

## Preserve results and ownership

Report accepted jobs separately from completed output. Use job status to obtain the saved result or actual final failure. Return useful previews and original download references, and keep source and workflow provenance intact. Do not claim a refund before the service reports it.

Update or delete only the assets explicitly covered by the user's request. Reuse permission already provided for those exact targets. A workflow association is distinct from the global asset: detaching from a workflow must not become a global library deletion. Never call checkout, credit-grant, account-deletion or administrative actions through this integration.
