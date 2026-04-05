# Repo Surfaces Reference

## Scope
- Stable lookup facts for the main files that define this repository's public workflow and Codex integration surfaces.

## Stable Facts
- `commands/init.md`: Contract for initializing or re-bootstrapping llmdoc.
- `commands/update.md`: Contract for reflecting first and then updating stable docs.
- `skills/llmdoc/SKILL.md`: Core operating skill for llmdoc projects.
- `skills/llmdoc-init/SKILL.md` and `skills/llmdoc-update/SKILL.md`: Codex-native helper entry skills that mirror `/llmdoc:init` and `/llmdoc:update`.
- `agents/investigator.md`, `agents/worker.md`, `agents/recorder.md`, `agents/reflector.md`: Claude-style role prompts for the internal workflow.
- `.codex/config.toml`: Codex-wide agent fan-out and depth limits for this repository.
- `.codex/agents/*.toml`: Project-scoped Codex custom agents.
- `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json`: Plugin metadata for Codex and Claude Code.
- `README.md` and `README.zh-CN.md`: Public summaries that should reflect actual workflow behavior, not aspirational behavior.

## Sources of Truth
- `README.md` (`Public Surface`): English user-facing contract.
- `README.zh-CN.md` (`公开接口`): Chinese user-facing contract.
- `commands/init.md` (`/llmdoc:init`): Init workflow source of truth.
- `commands/update.md` (`/llmdoc:update`): Update workflow source of truth.
- `.codex/config.toml` (`[agents]`): Codex runtime limit source of truth.
