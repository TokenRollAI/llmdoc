---
name: llmdoc-update
description: "Codex-native entry skill for reflecting first and then updating llmdoc. Use this when you want the /llmdoc:update workflow in Codex."
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# llmdoc-update

This skill is the Codex-native equivalent of `/llmdoc:update`.

Use it when:

- a task changed project knowledge, architecture understanding, or workflow guidance
- a useful mistake or missing-doc lesson should be preserved
- you want a command-like Codex entrypoint for updating llmdoc

Before editing stable docs:

- read `llmdoc/index.md`
- read `llmdoc/startup.md` and the MUST docs it lists
- proactively read relevant `llmdoc/guides/` and `llmdoc/memory/reflections/`
- when recurring lessons have already been promoted into stable docs, prefer those stable docs first and open raw reflections only when the original task context still matters
- align with the user before non-trivial edits

Then execute this workflow:

1. Rebuild task context.
   - Inspect the current working tree, staged changes, and any explicit task summary.
   - Prefer targeted investigation over broad repo scans.

2. Investigate the impacted concepts.
   - Use short, evidence-first exploration.
   - Persist temporary investigation notes under `.llmdoc-tmp/investigations/` only when they help the current update.

3. Reflect before editing stable docs.
   - Write a task-specific reflection under `llmdoc/memory/reflections/`.
   - Capture mistakes, missing docs, bad assumptions, and promotion candidates.

4. Update stable llmdoc docs.
   - Update only the impacted docs.
   - Promote lessons into `must/`, `guides/`, or `reference/` only when they are stable and likely to recur.
   - If `llmdoc/memory/reflections/` now contains more than 5 files, run a consolidation pass before finishing the update.
   - Consolidate by recurring lesson, not by reflection chronology.
   - Promote short cross-task rules into `must/`.
   - Promote reusable constraints, checklists, thresholds, and small worked examples into `reference/`.
   - Use plain language. Add examples only when they make the lesson easier to apply.
   - Update an existing stable doc when it already fits the lesson. Do not create a catch-all summary dump and do not copy reflection text verbatim.
   - Split docs aggressively instead of appending to large mixed files.

5. Synchronize `llmdoc/index.md`.
   - Ensure changed docs are discoverable.
   - Keep reflections and decisions listed separately from stable docs.

6. Report the reflection path and the stable docs that changed.

At the end of a non-trivial task, proactively consider whether the user should be prompted to run this workflow.
