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
- align with the user before non-trivial edits

Then execute this workflow:

1. Rebuild task context.
   - Inspect the current working tree, staged changes, and any explicit task summary.
   - Prefer targeted investigation over broad repo scans.

2. Investigate the impacted concepts.
   - Use short, evidence-first exploration.
   - Recreate `.llmdoc-tmp/investigations/` on demand before any file-sink investigation or main-assistant fallback write. Do not assume init left the directory behind.
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
   - If the main assistant cannot create `.llmdoc-tmp/investigations/`, cannot write the fallback report, or cannot restore `output_path` from a valid sidecar, pause update and explicitly ask the user for authorization to write the blocked scratch files under `.llmdoc-tmp/investigations/`. Explain which topics are blocked and that update has not finished.

3. Reflect before editing stable docs.
   - Write a task-specific reflection under `llmdoc/memory/reflections/`.
   - Capture mistakes, missing docs, bad assumptions, and promotion candidates.

4. Update stable llmdoc docs.
   - Update only the impacted docs.
   - Promote lessons into `must/`, `guides/`, or `reference/` only when they are stable and likely to recur.
   - Split docs aggressively instead of appending to large mixed files.

5. Synchronize `llmdoc/index.md`.
   - Ensure changed docs are discoverable.
   - Keep reflections and decisions listed separately from stable docs.

6. Report the reflection path and the stable docs that changed.

At the end of a non-trivial task, proactively consider whether the user should be prompted to run this workflow.
