---
description: "Keep tracked llmdoc docs current with the repository using the lightest sufficient update mode."
argument-hint: "[optional summary of what changed]"
---

# /llmdoc:update

Use this command after a task when the tracked project knowledge, workflow guidance, or doc structure should be updated.

The goal is not to archive everything the task discovered. The goal is to keep tracked `llmdoc/` docs consistent with the current repository while staying smaller than the source code or adding architectural explanation the source cannot provide by itself.

Before executing the workflow, load the `llmdoc` skill.

Why:

- the skill defines what belongs in `must/`, stable docs, and memory
- the skill explains update modes, memory handling, and when reflection is useful
- this command should focus on orchestration, not re-explain the whole system

## Mode Selection

Choose the lightest mode that can keep the docs correct.

- `fast` is the default when the coordinating assistant just implemented the change and has fresh context. Skip mandatory investigation and update stable docs from the task summary, diff, targeted checks, and any still-valid local scratch reports.
- `analysis` is for stale context, unclear impact, current-state research, or handoff work. Use one focused analysis pass, usually `investigator` with `sink=file`, then let `recorder` consume the scratch report and the current working tree.
- `full` is for high-risk rewrites, init-like rebootstrap work, disputed facts, or reflection-heavy failures. Use investigator, reflector, and recorder as separate roles.

Escalate from `fast` to `analysis` when the assistant cannot name the impacted docs confidently. Escalate to `full` when independent review is more valuable than speed.

## `.llmdoc-tmp/`

`.llmdoc-tmp/` is a local temporary context cache, not stable project memory.

- Investigator reports may be retained across sessions under `.llmdoc-tmp/investigations/`.
- They are ignored by git, not indexed by `llmdoc/index.md`, and may be deleted at any time.
- Reuse them only after checking their recorded git revision, scope, and unresolved gaps against the current repository.
- Promote only durable conclusions into tracked `llmdoc/` docs.

## Actions

1. Rebuild task context.
   - Read `llmdoc/index.md`.
   - Read `llmdoc/startup.md` and the files it lists when available.
   - Proactively read relevant `llmdoc/guides/` and `llmdoc/memory/reflections/` before planning edits.
   - Inspect the current working tree, staged changes, and any explicit change summary from `$ARGUMENTS`.
   - Check whether relevant `.llmdoc-tmp/investigations/` reports exist, but treat them as temporary evidence to validate, not as truth.

2. Select the update mode.
   - Prefer `fast` for immediate post-implementation updates by the same assistant.
   - Use `analysis` when the current state needs a fresh evidence map.
   - Use `full` when the update needs independent reflection or risk review.

3. Investigate only when the selected mode needs it.
   - In `fast`, prefer targeted checks and the coordinating assistant's fresh task summary.
   - In `analysis`, use `investigator` for a single focused scratch report under `.llmdoc-tmp/investigations/`.
   - In `full`, use separate investigation and reflection steps.
   - Prefer targeted questions over broad repo scans in every mode.

4. Reflect only when reflection has value.
   - In `full`, use `reflector` to write the reflection so independent role review is preserved.
   - In `fast` or `analysis`, write a task-specific reflection into `llmdoc/memory/reflections/` only when the task exposed a workflow failure, repeated mistake, missing signal, or durable process lesson.
   - Do not force a reflection for routine `fast` updates that only keep stable docs current.

5. Update stable llmdoc with `recorder`.
   - Update only the impacted docs.
   - Remove or correct stable-doc claims that no longer match the current code.
   - Promote lessons into `must/`, `guides/`, `architecture/`, or `reference/` only when they are stable and likely to recur.
   - Split documents aggressively instead of appending to a large file.
   - Keep tracked docs compact: they should be smaller than the source they describe or explain design and implementation intent that source search does not expose quickly.
   - Reconcile `llmdoc/memory/doc-gaps.md`: close resolved gaps, mark stale gaps, and add only actionable new gaps with closure criteria.

6. Run the active-memory archive check.
   - After any new reflection is written, count active memory files under `llmdoc/memory/`, excluding `llmdoc/memory/lessons-learned.md`, `llmdoc/memory/doc-gaps.md`, and anything under `llmdoc/memory/archive/`.
   - If the count is greater than 5, follow `skills/llmdoc/references/lessons-learned.md`: summarize recurring lessons into `llmdoc/memory/lessons-learned.md`, link each lesson to its source memory file, and move summarized raw memory into `llmdoc/memory/archive/YYYY-MM-DD/`.
   - Treat hook reminders as best-effort only; this workflow step is the precise archive checkpoint.

7. Synchronize `llmdoc/index.md`.
   - Ensure new and changed docs are discoverable.
   - Keep reflections and decisions listed separately from stable docs.
   - Do not index `.llmdoc-tmp/`.

8. Report the mode used, any scratch report or reflection path, the archive action taken or skipped, and the stable docs that changed.
