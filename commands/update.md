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
   - Inspect the current working tree, staged changes, and any explicit change summary from `$ARGUMENTS`.

2. Investigate the impacted concepts.
   - Use `investigator`.
   - Prefer targeted questions over broad repo scans.
   - Recreate `.llmdoc-tmp/investigations/` on demand before any file-sink investigation or coordinating-assistant fallback write. Do not assume init left the directory behind.
   - Persist temporary investigation notes under `.llmdoc-tmp/investigations/` only when they help the current update.
   - When using `sink=file`, `topic` and `output_path` are required. Assign a stable `topic` label and a unique `output_path` under `.llmdoc-tmp/investigations/` before launching the investigation.
   - File-sink update investigations use the same persistence contract as init: write the full report to `output_path` first, append `<!-- llmdoc:eor -->` as the last line, then attempt a best-effort sidecar write to `<output_path>.sidecar.md`.
   - Treat `output_path` as the canonical artifact for the update investigation. The sidecar is recovery-only and must never replace the primary artifact.
   - Treat each file-sink investigation result as one of the same four states used by init: `persisted`, `write_failed_fallback_ready`, `transport_failure`, or `context_overflow`.
   - Do not rely on a `persisted` response until `output_path` exists, is non-empty, and contains the `<!-- llmdoc:eor -->` sentinel.
   - A sidecar-only write is not `persisted`.
   - If an investigation returns `write_failed_fallback_ready`, immediately write `report_markdown` to the same `output_path`, then verify the file and sentinel before using it.
   - If the investigation transport fails, first check `output_path` on disk. If `output_path` is missing, empty, or lacks the sentinel, then check `<output_path>.sidecar.md`. A valid sidecar is only a recovery source: when the sidecar is complete, copy it back to `output_path`, verify the restored canonical file, and continue only after `output_path` exists, is non-empty, and contains the sentinel. Only rerun when neither path yields a restorable report.
   - If the investigation hits `context_overflow`, do not rerun the same brief scope. Split the topic into narrower follow-up briefs instead.
   - If the coordinating assistant cannot create `.llmdoc-tmp/investigations/`, cannot write the fallback report, or cannot restore `output_path` from a valid sidecar, pause update and explicitly ask the user for authorization to write the blocked scratch files under `.llmdoc-tmp/investigations/`. Explain which topics are blocked and that update has not finished.

3. Reflect before editing stable docs.
   - Use `reflector` to write a task-specific reflection into `llmdoc/memory/reflections/`.
   - Capture mistakes, missing docs, bad assumptions, and promotion candidates.

4. Update stable llmdoc with `recorder`.
   - Update only the impacted docs.
   - Promote lessons into `must/`, `guides/`, or `reference/` only when they are stable and likely to recur.
   - Split documents aggressively instead of appending to a large file.

5. Synchronize `llmdoc/index.md`.
   - Ensure new and changed docs are discoverable.
   - Keep reflections and decisions listed separately from stable docs.

6. Report the reflection path and the stable docs that changed.
