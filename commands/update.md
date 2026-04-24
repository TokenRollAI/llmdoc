---
description: "Persist newly learned project knowledge by reflecting first and then updating llmdoc."
argument-hint: "[optional summary of what changed]"
---

# /llmdoc:update

Use this command after a task when the project knowledge, workflow guidance, or doc structure should be updated.

Before executing the workflow, load the `llmdoc` skill.

Why:

- the skill defines what belongs in `must/`, stable docs, and memory
- the skill explains why reflection happens before stable doc updates
- this command should focus on orchestration, not re-explain the whole system

## Actions

1. Rebuild task context.
   - Read `llmdoc/index.md`.
   - Read `llmdoc/startup.md` and the files it lists when available.
   - Proactively read relevant `llmdoc/guides/` and `llmdoc/memory/reflections/` before planning edits.
   - When recurring lessons have already been promoted into stable docs, prefer those stable docs first and re-open raw reflections only when the original task context still matters.
   - Inspect the current working tree, staged changes, and any explicit change summary from `$ARGUMENTS`.

2. Investigate the impacted concepts.
   - Use `investigator`.
   - Prefer targeted questions over broad repo scans.
   - Persist temporary investigation notes under `.llmdoc-tmp/investigations/` only when they help the current update.

3. Reflect before editing stable docs.
   - Use `reflector` to write a task-specific reflection into `llmdoc/memory/reflections/`.
   - Capture mistakes, missing docs, bad assumptions, and promotion candidates.

4. Update stable llmdoc with `recorder`.
   - Update only the impacted docs.
   - Promote lessons into `must/`, `guides/`, or `reference/` only when they are stable and likely to recur.
   - If `llmdoc/memory/reflections/` now contains more than 5 files, run a consolidation pass before finishing the update.
   - Consolidate by recurring lesson, not by reflection chronology.
   - Promote short cross-task rules into `must/`.
   - Promote reusable constraints, checklists, thresholds, and small worked examples into `reference/`.
   - Use plain language. Add examples only when they make the lesson easier to apply.
   - Update an existing stable doc when it already fits the lesson. Do not create a catch-all summary dump and do not copy reflection text verbatim.
   - Split documents aggressively instead of appending to a large file.

5. Synchronize `llmdoc/index.md`.
   - Ensure new and changed docs are discoverable.
   - Keep reflections and decisions listed separately from stable docs.

6. Report the reflection path and the stable docs that changed.
