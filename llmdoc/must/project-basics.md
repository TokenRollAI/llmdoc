# Project Basics

## Identity
- This repository packages `llmdoc` as a doc-driven workflow for Claude Code and Codex.
- Its public interface is intentionally small: one core operating skill, two helper Codex entry skills, two workflow command contracts, plugin integration files, and project-scoped agents.

## Boundaries
- This repository owns the reusable `llmdoc` skill, workflow commands, agent prompts, and plugin metadata.
- It does not own a runtime orchestration service; much of the behavior is defined through prompts, command docs, and tool-facing configuration.

## Major Areas
- `skills/llmdoc/`: the reusable skill and detailed workflow references
- `commands/`: public command contracts such as `/llmdoc:init` and `/llmdoc:update`
- `agents/`: role-specific prompts for investigation, execution, reflection, and stable-doc maintenance
- `.codex/` and plugin manifests: Codex integration and agent limits
- `README.md` and `README.zh-CN.md`: public-facing behavior summary that should stay aligned with the actual workflow
