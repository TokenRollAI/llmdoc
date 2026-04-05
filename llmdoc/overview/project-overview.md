# Project Overview

## Identity
- `llmdoc` is a reusable doc-driven workflow for Claude Code and Codex.
- The repository packages one core operating skill, helper Codex entry skills, workflow command contracts, supporting agents, and plugin integration files.

## Boundaries
- The main product is workflow guidance and reusable repo-local integration artifacts.
- This repository should keep public usage simple while moving detailed methodology into the reusable skill and llmdoc docs.
- Temporary task investigation notes should not become stable project memory unless the lesson is likely to recur.

## Major Areas
- Public usage and installation: `README.md`, `README.zh-CN.md`, `.claude-plugin/`, `.codex-plugin/`
- Command contracts: `commands/init.md`, `commands/update.md`
- Agent behavior: `agents/*.md`, `.codex/agents/*.toml`
- Core methodology: `skills/llmdoc/SKILL.md` and `skills/llmdoc/references/`
