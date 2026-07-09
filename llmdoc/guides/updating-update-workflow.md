# How to Update the Update Workflow

## Preconditions
- Read `llmdoc/architecture/update-orchestration.md`.
- Inspect both Claude Code command docs and Codex helper skills before changing behavior.

## Main Steps
1. Update `commands/update.md` when the Claude Code command contract changes. This is the source of truth for the resolution ladder, batch flags, mode selection, and the terminal watermark advance.
2. Update `skills/llmdoc-update/SKILL.md` so Codex follows the same contract, including the identical Change Detection ladder.
3. Update `agents/investigator.md` if scratch report behavior, metadata (including `Range:`/`Watermark:`), net-diff input, or reuse rules change.
4. Update `agents/recorder.md` if stable-doc consistency, doc-gaps reconciliation, routing rules, or the commit-watermark ownership rules change.
5. Update `agents/reflector.md` and `agents/worker.md` when per-commit-history usage or the "recorder is the sole writer of `sync.md`/`index.md`" rule changes.
6. Update `commands/init.md` and `skills/llmdoc-init/SKILL.md` when the `llmdoc/state/sync.md` skeleton path or watermark seeding step changes.
7. Update `skills/llmdoc/references/update-and-memory.md` and `skills/llmdoc/references/templates.md` (the `state/sync.md` template) when the watermark model or its template changes.
8. Update `.codex/agents/*.toml` when project-scoped Codex subagent behavior changes (recorder watermark ownership, worker restrictions, reflector per-commit history, investigator net-diff input).
9. Update `README.md` and `README.zh-CN.md` so the public workflow summary matches the actual contract, including commit-watermark change detection.
10. Update plugin manifest versions together for Claude Code and Codex when publishing a behavior change.

## Verification
- `/llmdoc:update` describes commit-watermark change detection, the resolution ladder, batch flags, and `fast`/`analysis`/`full` modes keyed on range size × authorship × risk.
- Codex `llmdoc-update` describes the same detection model and modes.
- `llmdoc/state/sync.md` exists, is seeded at init, and is never indexed or added to `startup.md`/`must/`.
- Only `recorder` writes `sync.md`/`index.md`; `worker` never edits them.
- Investigator reports are described as temporary context cache, not stable docs, and record the resolved range/watermark.
- Recorder rules require stable docs to match current code, reconcile `doc-gaps.md`, and advance the watermark only as the terminal step of a successful committed-range update.
- Public README summaries match both Claude Code and Codex behavior.

## Common Failure Points
- Changing only the Claude Code command while leaving Codex helper skills stale.
- Advancing the watermark on a `--working-tree-only`, failed, partial, or HEAD-behind run.
- Documenting an intermediate state instead of the batch-tip state.
- Indexing `llmdoc/state/sync.md` or treating it as active memory.
- Treating `.llmdoc-tmp/` as durable project memory because reports persist locally.
- Requiring reflection for routine updates with no process lesson.
- Adding volatile counts or raw inventory to stable docs instead of checking them on demand.
