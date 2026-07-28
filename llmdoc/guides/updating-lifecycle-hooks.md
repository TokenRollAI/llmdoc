# How to Update Lifecycle Hooks

## Preconditions
- Read `llmdoc/architecture/context-lifecycle.md`.
- Inspect the current worktree versions of `hooks/hooks.json`, `skills/llmdoc/templates/session-start.sh`, and any public docs that describe lifecycle behavior.

## Surfaces To Keep Aligned
- `hooks/hooks.json`: bundled Codex `SessionStart` hook shipped with the plugin.
- `skills/llmdoc/templates/codex-hooks.json`: installable template copy of the hook matchers.
- `skills/llmdoc/templates/session-start.sh`: lifecycle-specific startup-pack fingerprint and byte-budget emitter.
- `skills/llmdoc/templates/compact-prompt.md`: optional `LLMDOC_STATE` schema guidance.
- `skills/llmdoc/templates/stop.sh`: opt-in `Stop` behavior when reminder/logging semantics change.
- `skills/llmdoc/references/operating-protocol.md`, `doc-structure.md`, and `codex-cli-hooks.md`: reusable skill guidance.
- `commands/init.md`, `commands/update.md`, `README.md`, and `README.zh-CN.md`: public workflow contract.
- `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `AGENTS.example.md`, `CLAUDE.example.md`, `agents/recorder.md`, and `.codex/agents/llmdoc-recorder.toml`: prompts and metadata that currently mirror recorder-facing lifecycle wording.

## Lifecycle Invariants
- `startup|clear` must describe one cold-start read of the llmdoc skill, `index.md`, `startup.md`, and MUST docs.
- `resume` must prefer a valid `LLMDOC_STATE` and fall back to a single cold start only when that state is absent, stale, or insufficient.
- `compact` must never instruct the model to reload the llmdoc skill or startup pack merely because compaction occurred.
- The startup pack remains `index.md` + `startup.md` + `must/`, fingerprinted from file digest, byte count, and relative path.
- The default startup-pack budget remains `24 KiB` unless the project intentionally changes `LLMDOC_STARTUP_MAX_BYTES`.
- The root index stays an L0 router; if the startup pack grows, add subsystem indexes instead of broadening cold-start reads.
- `LLMDOC_STATE` stores distilled task state and paths, not full document bodies.

## Verification
1. Run `skills/llmdoc/scripts/verify-lifecycle-hooks.sh <project-root>`.
2. Confirm it checks all three matchers in both `hooks/hooks.json` and `templates/codex-hooks.json`.
3. Confirm compact output includes `LLMDOC_COMPACT_REENTRY` and rejects cold-start instructions.
4. Confirm cold and compact outputs emit the same startup-pack fingerprint for the same tree.
5. Re-check `wc -c llmdoc/index.md llmdoc/startup.md llmdoc/must/*.md` when startup-pack wording changes.
6. If you touched the compact-prompt path, verify docs still describe it as opt-in and do not silently require `.codex/config.toml` changes.

## Common Failure Points
- Updating only the template hook or only the bundled hook.
- Treating `compact` like `resume`, or `resume` like unconditional cold start.
- Letting compact summaries copy full llmdoc documents instead of a compact `LLMDOC_STATE`.
- Growing the root index into a leaf catalog and then compensating by reloading more docs on every re-entry.
- Changing lifecycle semantics in templates or scripts without mirroring the public docs and agent prompts.
