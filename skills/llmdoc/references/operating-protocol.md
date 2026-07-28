# Operating Protocol

## Lifecycle modes

Distinguish three modes:

- **Cold start** (`startup` or `clear`): load the core skill and startup pack once.
- **Resume**: reuse a valid preserved state; otherwise fall back to one cold start.
- **Compact re-entry**: continue the same task from the compact summary. Compaction alone never triggers a full llmdoc reload.

## Cold-start reads

On a cold start, if `llmdoc/` exists:

1. Read `llmdoc/index.md`.
2. Read `llmdoc/startup.md` when it exists.
3. Read the MUST files listed there, in order.
4. Proactively read task-relevant `guides/` and `memory/reflections/` before planning or editing.
5. Read the remaining task-relevant docs from `overview/`, `architecture/`, and `reference/`.

Why:

- startup reads give the minimum common context
- proactive guide reads reduce avoidable implementation mistakes
- proactive reflection reads reduce repeated workflow mistakes

The cold-start package must stay bounded as the repository grows. Treat `index.md` as a top-level router, not an inventory of every leaf document, and keep `startup.md` plus `must/` small enough to load once without crowding out task work.

## Re-entry rules

After compact re-entry, trust the compact summary and its `LLMDOC_STATE`. Do not re-read the core skill, `index.md`, `startup.md`, MUST docs, lessons, or already-loaded task docs just because context was compacted.

The compact state should preserve only:

- startup-pack fingerprint when available
- active goal and exact next action
- loaded document paths and task-critical invariants
- decisions, changed files, validation status, and unresolved risks

Do not copy full document bodies into the state.

Re-read the smallest relevant document set before broad code search only when:

- entering a new subsystem
- the preserved startup fingerprint differs from the current one
- a relevant document changed
- the compact state lacks a fact required for the next action
- seeing conflicting evidence
- hitting a failed command or test
- needing stronger confidence before editing
- seeing a related guide or reflection that might improve quality

If refresh is needed, start with the named task document or subsystem index. Fall back to the complete cold-start package only when required invariants cannot otherwise be recovered.

## Collaboration

Before planning or editing non-trivial code, the main assistant should actively synchronize with the user unless the request is trivial and unambiguous.

Do this by default:

1. State the current understanding of the task.
2. Surface the main assumptions, risks, or tradeoffs.
3. Ask focused questions when scope, intent, or constraints are unclear.
4. Discuss the likely approach before writing non-trivial code or restructuring docs.

This collaboration rule is for the coordinating assistant, not for execution-only worker subagents.

## Code reference policy

Default to file or symbol granularity:

`path/to/file.ext` (`SymbolName`): Brief description.

Add line numbers only when needed to prove a disputed, subtle, or non-obvious behavior.
