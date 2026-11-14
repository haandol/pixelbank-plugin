---
name: pixelbank-creative-workflows
description: Create and reuse PixelbankStudio images and workflows through MCP, handing visual selection and layered composition to a prepared PixelbankStudio web workspace.
---

Use the official name PixelbankStudio in customer-facing replies. Support English and Korean, responding in the creator's language while preserving tool identifiers and structured values.

Use PixelbankStudio's authenticated tools for the creator's task. Read the current tool catalog and account state before relying on availability, price or free uses. Use only tools actually advertised by the service.

This release supports images, animation and their workflows. Space, previsualization, video import and video generation execution are unavailable through MCP. Do not route those requests through another tool or an arbitrary API call.

Each tool shows its actions and a short argument outline only. Before an unfamiliar action, read its exact arguments, consent fields and authority with the `pixelbank_read` action `describe` and `arguments: {"action": "<action>"}`; `describe` without arguments lists every action with a one-line summary. The packaged [tool contracts](../../contracts/tools.json) hold the same exact schemas for offline reading; the connected server's schema and availability take precedence. Preserve complete upload references returned by `upload_image`; never invent their keys or checksums.

## Call the five tools

PixelbankStudio shows five tools, one per authority class. Each takes a required `action` and that action's arguments in one object named `arguments`, for example `{"action": "get_asset", "arguments": {...}}`. An action without arguments takes `action` alone. Use only actions listed in the live `action` enum.

| Tool | Actions |
| --- | --- |
| `pixelbank_read` | `get_account`, `list_assets`, `get_asset`, `quote_upscaling`, `get_job`, `list_animations`, `get_animation`, `list_animation_jobs`, `list_workflow_definitions`, `list_workflows`, `get_workflow`, `get_workflow_activity`, `quote_workflow`, `describe`, `wait_for_workflow`, `open_workspace` |
| `pixelbank_edit` | `prepare_workspace`, `update_asset_tags`, `save_cutout`, `recompose_animation`, `update_animation_tags`, `create_workflow`, `update_workflow`, `import_workflow_source`, `upload_image` |
| `pixelbank_delete` | `delete_asset`, `delete_animation`, `delete_workflow` |
| `pixelbank_run` | `remove_background`, `segment`, `segment_and_save`, `generate_image`, `generate_animation`, `upscale_image`, `correct_animation_frame`, `execute_workflow` |
| `pixelbank_connection` | `connect`, `disconnect`, `open_credits_page` |

Reads, quotes, describe and edits never charge. `wait_for_workflow`, `open_workspace` and `upload_image` run in the local plugin and keep their tool's class. For paid `pixelbank_run` actions, put `operation_key`, `maximum_credits` and any approved `paid_fallback_credits` or `workflow` context inside `arguments` beside `request`. `execute_workflow` keeps its run, action ID, revision, quote and maximum in its own arguments. In `update_workflow`, the kind of change goes in its own `action` field inside `arguments`. Former tool names, including the former separate local tools, are retired and refused with their replacement.

`INVALID_ARGUMENTS` and `INVALID_ACTION` mean nothing started: correct the argument at the returned `location`, using `describe` if needed, and send the call again. Other refusals, including `INVALID_INPUT`, may follow a write; check existing results before an explicit retry with the original request and operation key.

## Choose a creative workflow

For a multi-step result, discover supported definitions with the `pixelbank_read` action `list_workflow_definitions` and create the requested workflow once with the `pixelbank_edit` action `create_workflow`. Supply its required inputs with `update_workflow` or `import_workflow_source` and preserve the run ID and acknowledged revision. Quote the selected plan with `quote_workflow`, obtain its required bounded cost authority, and call the `pixelbank_run` action `execute_workflow` once with the original action ID and quoted maximum. Automatic workflows choose their declared preparation path and save final results in the normal library without intermediate user actions. A direct request such as background removal can use the `pixelbank_run` action `remove_background` without creating a workflow.

For an accepted execution, use the bounded read-only `pixelbank_read` action `wait_for_workflow` with `run_id` and an optional `max_wait_seconds` from 1 to 60. It returns at once for a finished run; otherwise follow the returned poll delay and stop on completed or failed state. Use `get_workflow` or `get_workflow_activity` for the full run record. Wait cancellation or expiry does not cancel the server execution. Do not require metadata confirmation, manual box drawing, per-step continuation or final acceptance. A failed execution preserves its history and saved assets; a new execution needs the creator's retry intent.

Earlier guided runs retain their captured action and selection rules. Every such action keeps its action ID and acknowledged revision. A page opening, preview, poll or tab closing is not a completed step. Do not apply guided actions to an active automatic execution.

## Prepare images and cost authority

Upload only files the user selected. The `pixelbank_edit` action `upload_image` reads a local PNG, JPEG or WebP from `file_path` and uses the purpose-bound direct-upload ticket. Match the purpose to the processing tool. For persistent web-workspace sources, use `workflow-input` with `save_source: true`; retain the returned stable asset reference. Preserve originals when preparing an input copy for the tool's documented size limit.

Read current prices and free uses with `get_account`, and quote upscaling with `quote_upscaling` first. Explain the processing outcome and cost before submission, honoring the account's existing explicit credit-auto-confirm opt-in. Use a zero maximum when only a free use is authorized. A paid operation carries the approved maximum credits and one stable operation key. A free-use lookup failure requires separate consent for the exact paid fallback amount even when auto-confirm is enabled. Insufficient balance is not permission to change funding or repeat the call.

When the selected task cannot be funded after eligible free uses, explain the shortage in the creator's language, show a clickable [PixelbankStudio credit page](https://www.pixelbankstudio.com/pricing), and call the `pixelbank_connection` action `open_credits_page` before submitting processing. A `NOT_ENOUGH_CREDIT` response has already attempted to open that page: show its `credits_url` link and use `credits_page_opened` to describe the outcome without opening it again. The creator chooses a credit package and completes payment on the website. When they ask to continue, re-read the account and any required quote, reconcile the original outcome, and preserve the original operation key and approved authority.

A zero balance with an eligible free use is not a credit shortage. `FREE_TRIAL_UNAVAILABLE`, `CREDIT_PRICE_CHANGED` and `MCP_APPROVAL_INVALID` retain their separate consent or quote guidance. Page opening does not confirm purchase or authorize another processing call.

For retries, retain the complete original request, operation key, budget and workflow context. An unknown outcome is not a failed job. Recover the original job or existing result; do not create a new key to repeat a possibly accepted operation. A new intentional generation using identical inputs still needs the existing duplicate-submission confirmation.

## Continue visual editing in PixelbankStudio

Background removal and other fully specified operations can run directly. Interactive segmentation and layered image composition use the PixelbankStudio web editor when visual control is needed. Do not imply that a plain prompt recreates an unprovided selection mask or composition.

Prepare the workspace with the `pixelbank_edit` action `prepare_workspace`, using owned asset references and the agreed settings. Generation preparation can carry ordered images, layer/object roles, names, normalized position/size, visibility, locks, canvas framing and the draft prompt. Use the current supported schema; the web editor currently does not support nonzero layer rotation. An object reference requires its name, and at most five object references are accepted. Ordinary composed layers do not spend that reference budget.

For additional edits to automatic results, prepare a standalone expert workspace from the saved library image, without a workflow execution context. Bind preparation to the current run, step and revision only for a legacy guided workflow. For that guided context, every prepared source must already belong to the run, and the selected step inputs must remain included; attach any additional owned source first and use the returned revision. Call the `pixelbank_read` action `open_workspace` with the returned `workspace_id` when the user wants to open it, and retain the returned URL. Opening loads initial settings without processing or charging. Subsequent browser edits are not autosaved by the handoff record. Do not replace unrelated unsaved work.

When the creator returns from a guided workflow's web editor, inspect the same run and selected result, then continue with its permitted next action. A standalone expert edit leaves its original automatic workflow complete. A stale preparation, changed run or deleted source requires reconciliation from current acknowledged state; do not overwrite a newer choice or fabricate completion.

## Preserve results and ownership

Report accepted jobs separately from completed output. Use the `get_job` action to obtain the saved result or actual final failure. Return useful previews and original download references, and keep source and workflow provenance intact. Do not claim a refund before the service reports it.

Update or delete only the assets explicitly covered by the user's request. Reuse permission already provided for those exact targets. Every `pixelbank_delete` action needs its exact owned target and `confirmed: true`, sent only after the creator explicitly asked to delete that image, animation or workflow run. A workflow association is distinct from the global asset: detaching from a workflow must not become a global library deletion. Never call checkout, credit-grant, account-deletion or administrative actions through this integration.
