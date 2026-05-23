---
name: llmdoc-update
description: "Codex-native entry skill for keeping tracked llmdoc docs current with the repository. Use this when you want the /llmdoc:update workflow in Codex."
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# llmdoc-update

This skill is the Codex-native equivalent of `/llmdoc:update`.

The update target is tracked `llmdoc/`, not `.llmdoc-tmp/`. Stable docs should stay consistent with the current repository and remain smaller than the source code or provide architectural explanation that source search does not.

Use it when:

- a task changed project knowledge, architecture understanding, or workflow guidance
- a useful mistake or missing-doc lesson should be preserved
- you want a command-like Codex entrypoint for updating llmdoc

Before editing stable docs:

- read `llmdoc/index.md`
- read `llmdoc/startup.md` and the MUST docs it lists
- proactively read relevant `llmdoc/guides/` and `llmdoc/memory/reflections/`
- read `skills/llmdoc/references/lessons-learned.md` for the active-memory archive threshold and archive procedure
- check relevant `.llmdoc-tmp/investigations/` reports only as local temporary evidence, validating their git revision, scope, and gaps before reuse
- align with the user before non-trivial edits

Then execute this workflow:

1. Rebuild task context.
   - Inspect the current working tree, staged changes, and any explicit task summary.
   - Prefer targeted investigation over broad repo scans.

2. Select the lightest update mode that keeps docs correct.
   - `fast`: default for immediate post-implementation updates when the coordinating assistant has fresh context. Use the task summary, diff, targeted checks, and any still-valid scratch reports.
   - `analysis`: use when current-state research, stale context, or unclear impact requires one focused evidence pass. Persist the report under `.llmdoc-tmp/investigations/`.
   - `full`: use when risk, disputed facts, or process learning justify separate investigation, reflection, and recording roles.

3. Investigate only as needed by the selected mode.
   - In `fast`, do targeted checks instead of mandatory broad investigation.
   - In `analysis`, write one focused scratch report under `.llmdoc-tmp/investigations/`.
   - In `full`, keep investigation and reflection as separate steps.

4. Reflect only when reflection has value.
   - In `full`, use `reflector` to write the reflection so independent role review is preserved.
   - In `fast` or `analysis`, write a task-specific reflection under `llmdoc/memory/reflections/` only when there was a workflow failure, repeated mistake, missing signal, or durable process lesson.
   - Do not force a reflection for routine `fast` updates.

5. Update stable llmdoc docs.
   - Update only the impacted docs.
   - Remove or correct stable-doc claims that no longer match the current code.
   - Promote lessons into `must/`, `guides/`, `architecture/`, or `reference/` only when they are stable and likely to recur.
   - Split docs aggressively instead of appending to large mixed files.
   - Keep `llmdoc/memory/doc-gaps.md` reconciled by closing resolved gaps and adding only actionable new gaps.

6. Run the active-memory archive check.
   - After any new reflection is written, count active memory files under `llmdoc/memory/`, excluding `llmdoc/memory/lessons-learned.md`, `llmdoc/memory/doc-gaps.md`, and anything under `llmdoc/memory/archive/`.
   - If the count is greater than 5, follow `skills/llmdoc/references/lessons-learned.md`: summarize recurring lessons into `llmdoc/memory/lessons-learned.md`, link each lesson to its source memory file, and move summarized raw memory into `llmdoc/memory/archive/YYYY-MM-DD/`.
   - Treat hook reminders as best-effort only; this workflow step is the precise archive checkpoint.

7. Synchronize `llmdoc/index.md`.
   - Ensure changed docs are discoverable.
   - Keep reflections and decisions listed separately from stable docs.
   - Do not index `.llmdoc-tmp/`.

8. Report the mode used, scratch report or reflection path when present, the archive action taken or skipped, and the stable docs that changed.

At the end of a non-trivial task, proactively consider whether the user should be prompted to run this workflow.
