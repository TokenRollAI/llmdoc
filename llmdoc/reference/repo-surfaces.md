# Repo Surfaces Reference

## Scope
- Stable lookup facts for the main files that define this repository's public workflow and Codex integration surfaces.

## Stable Facts
- `commands/init.md`: Contract for initializing or re-bootstrapping llmdoc.
- `commands/update.md`: Contract for selecting an update mode and keeping tracked stable docs current.
- `skills/llmdoc/SKILL.md`: Core operating skill for llmdoc projects.
- `skills/llmdoc-init/SKILL.md` and `skills/llmdoc-update/SKILL.md`: Codex-native helper entry skills that mirror `/llmdoc:init` and `/llmdoc:update`.
- `hooks/hooks.json`: Bundled plugin hook surface for lifecycle-aware Codex `SessionStart`.
- `skills/llmdoc/templates/session-start.sh`: Emits cold-start, resume, and compact-reentry startup guidance plus startup-pack fingerprint and byte-budget signals.
- `skills/llmdoc/templates/codex-hooks.json`, `skills/llmdoc/templates/compact-prompt.md`, and `skills/llmdoc/templates/stop.sh`: Installable lifecycle templates; compact-prompt and `Stop` remain opt-in.
- `skills/llmdoc/scripts/verify-lifecycle-hooks.sh`: Verifier for matcher separation, compact no-reload behavior, and stable startup-pack fingerprinting.
- `agents/investigator.md`, `agents/worker.md`, `agents/recorder.md`, `agents/reflector.md`: Claude-style role prompts for the internal workflow.
- `.codex/config.toml`: Codex-wide agent fan-out and depth limits for this repository.
- `.codex/agents/*.toml`: Project-scoped Codex custom agents.
- `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json`: Plugin metadata for Codex and Claude Code.
- `README.md` and `README.zh-CN.md`: Public summaries that should reflect actual workflow behavior, not aspirational behavior.
- `llmdoc/state/sync.md`: Tracked, machine-managed commit watermark (`watermark-commit`) recording the last source commit reflected in `llmdoc/`. It is state, not knowledge: `recorder` is its sole writer, and it is never indexed or added to `startup.md`/`must/`. Seeded at init; advanced only as the terminal step of a successful `/llmdoc:update`.

## Sources of Truth
- `README.md` (`Public Surface`): English user-facing contract.
- `README.zh-CN.md` (`公开接口`): Chinese user-facing contract.
- `commands/init.md` (`/llmdoc:init`): Init workflow source of truth.
- `commands/update.md` (`/llmdoc:update`): Update workflow source of truth.
- `hooks/hooks.json` (`bundled SessionStart`): Runtime matcher and command source of truth for the plugin-shipped hook.
- `skills/llmdoc/templates/session-start.sh` (`lifecycle payload`): Startup-pack fingerprint, byte-budget, and lifecycle-specific re-entry wording source of truth.
- `llmdoc/architecture/update-orchestration.md` (`/llmdoc:update` design): Update mode, commit-watermark model, and knowledge-layer source of truth.
- `llmdoc/architecture/context-lifecycle.md` (`llmdoc re-entry design`): Cold-start, resume, compact-reentry, and startup-pack routing invariants.
- `llmdoc/state/sync.md` (`watermark-commit`): Machine-managed change-detection anchor; not a knowledge source of truth.
- `.codex/config.toml` (`[agents]`): Codex runtime limit source of truth.
