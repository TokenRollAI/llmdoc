# How to Update the Update Workflow

## Preconditions
- Read `llmdoc/architecture/update-orchestration.md`.
- Inspect both Claude Code command docs and Codex helper skills before changing behavior.

## Main Steps
1. Update `commands/update.md` when the Claude Code command contract changes.
2. Update `skills/llmdoc-update/SKILL.md` so Codex follows the same contract.
3. Update `agents/investigator.md` if scratch report behavior, metadata, or reuse rules change.
4. Update `agents/recorder.md` if stable-doc consistency, doc-gaps reconciliation, or routing rules change.
5. Update `.codex/agents/*.toml` when project-scoped Codex subagent behavior changes.
6. Update `README.md` and `README.zh-CN.md` so the public workflow summary matches the actual contract.
7. Update plugin manifest versions together for Claude Code and Codex when publishing a behavior change.

## Verification
- `/llmdoc:update` describes `fast`, `analysis`, and `full` modes.
- Codex `llmdoc-update` describes the same modes.
- Investigator reports are described as temporary context cache, not stable docs.
- Recorder rules require stable docs to match current code and reconcile `doc-gaps.md`.
- Public README summaries match both Claude Code and Codex behavior.

## Common Failure Points
- Changing only the Claude Code command while leaving Codex helper skills stale.
- Treating `.llmdoc-tmp/` as durable project memory because reports persist locally.
- Requiring reflection for routine updates with no process lesson.
- Adding volatile counts or raw inventory to stable docs instead of checking them on demand.
