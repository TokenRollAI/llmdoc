# Context Lifecycle

## Purpose
- Define the stable lifecycle contract for entering, resuming, and compactly re-entering llmdoc work.
- Keep startup context bounded as the repository grows, without losing task continuity after compaction.

## Lifecycle Modes
- **Cold start** (`startup` or `clear`): load the llmdoc skill, then `llmdoc/index.md`, `llmdoc/startup.md`, and the MUST docs listed there exactly once for the session.
- **Resume**: continue from a usable `LLMDOC_STATE` when its startup-pack fingerprint still matches; otherwise perform one cold-start read.
- **Compact re-entry** (`compact`): continue the same task from the compact summary. A compact event alone never authorizes replaying the skill, startup pack, lessons, or already-loaded task docs.

## Startup-Pack Contract
- The startup pack is `llmdoc/index.md` + `llmdoc/startup.md` + files under `llmdoc/must/`.
- `skills/llmdoc/templates/session-start.sh` fingerprints that pack from a sorted manifest of file digest, byte count, and relative path, then reports the combined UTF-8 byte size.
- The default startup budget is `24576` bytes (`24 KiB`) through `LLMDOC_STARTUP_MAX_BYTES`.
- Exceeding the budget is a maintenance signal, not permission to skip required startup context. Shrink MUST docs or add layered routing instead.

## Routing Model
- Keep the root `llmdoc/index.md` as an L0 router for the whole documentation system.
- In a monolith, add L1 subsystem indexes beside the documents they route, then load only the active subsystem index and the leaf docs needed for the task.
- Do not turn `startup.md` into a catalog of subsystem docs. Cold start should stay small enough to leave room for task work.

## Compact State Contract
- `LLMDOC_STATE` preserves only task-critical continuity:
  - startup-pack fingerprint
  - active goal
  - loaded doc paths and why they matter
  - invariants, decisions, changed files, validation status
  - exact next action
  - unresolved risks or blockers
- Store distilled facts and paths, not full llmdoc document bodies.

## Refresh Rules
- Re-read only the smallest relevant document set when:
  - the preserved startup fingerprint differs from the current one
  - a relevant document changed
  - the task enters a new subsystem
  - `LLMDOC_STATE` lacks a fact needed for the next action
  - evidence conflicts, validation fails, or stronger confidence is needed before editing
- If targeted refresh cannot recover the needed invariants, fall back to the cold-start pack once.

## Runtime Surfaces
- `hooks/hooks.json` is the bundled Codex hook surface. It ships only `SessionStart`, with separate matchers for `startup|clear`, `resume`, and `compact`.
- `skills/llmdoc/templates/session-start.sh` is the runtime payload generator for those lifecycle branches.
- `skills/llmdoc/templates/compact-prompt.md` is an optional override for preserving a stronger `LLMDOC_STATE` shape.
- `skills/llmdoc/templates/stop.sh` remains opt-in. `Stop` can remind or log, but it does not replace task-level llmdoc judgment.

## Verification Hand-off
- When lifecycle or hook behavior changes, update the aligned public surfaces and run `skills/llmdoc/scripts/verify-lifecycle-hooks.sh <project-root>`.
- Use `llmdoc/guides/updating-lifecycle-hooks.md` for the maintenance workflow.
