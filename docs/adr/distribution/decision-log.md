# Decision Log: distribution

[한국어](decision-log.ko.md)

This document is the **major decision-change history** of the distribution category. Each
ADR body describes only the current state, while the timeline of "what changed and why"
accumulates here, newest first. Git preserves the individual diffs.

The current Purpose, all still-valid Decision Drivers, adopted choice, rationale,
and requirement contract remain together in the ADR body. Reading this log is
optional for understanding the current decision.

<!-- Rules:
  - Reverse order (newest first). Major changes only — replacing the adopted alternative,
    inverting a Driver, a core algorithm/architecture change, a bug fix that changes
    behavior, a requirement value change, a requirement rule change (allowed set added or
    removed, mandatory → optional, a permission change, a forbidden transition allowed),
    a supersede, and retirement with no replacement.
    Minor items (correcting implementation facts, renaming an enum identifier, refining
    boundary wording, rephrasing) are not recorded — Git preserves them. For the criteria
    see authoring-rules.md "What to log — minor vs major".
  - Never duplicate the current state (that is the ADR body's job) — the currently valid
    requirements live in the ADR body, so do not copy them here. No implementation
    constants or field tables. But for a transition where a requirement value or rule
    changed, write it on the "What" line as old → new (that is the content of the transition).
    This log and the ADR's Alternatives section are the only places where a replaced
    identifier or previous value should be named for comparison.
    A reason that explains this transition and still supports the current choice
    also belongs in the ADR's current Purpose, Drivers, or adoption rationale.
    Do not remove it from the body merely because it appears on this log's "Why" line.
  - Never reference the PRD (ALPS).
  - Never embed an ADR number in the prose — point at it only through the single
    "Current ADR" link.
  - This file is a convention file — it is not registered in .mapping.json and
    adr-structure-lint does not check it (it is not enumerated as an ADR because it does
    not start with NNNN-).
  - Replace the example entry below with real content when recording the first major transition. -->

## 2026-11-12 — Follow live contracts and offer bounded workflow waiting

- **Current ADR**: [Bun-based plugin installation and distribution](./0001-bun-plugin-runtime.md)
- **Change type**: architecture and requirement rule change
- **What**: Forwarded remote calls gain validation against a refreshed catalog, generated public contract synchronization and a bounded read-only workflow wait. The existing Bun installation and release boundary remain.
- **Why**: API evolution should update tool inputs without maintaining a second handwritten schema, and long executions need progress observation without resubmitting work.

<!-- adr-writer:rules-version 0.11.3 — seeded by /adr-new. `adr-structure-lint` warns when this trails the installed plugin; refresh with /adr-new (it re-seeds a stale doc set). Keep this line on re-seed. -->
