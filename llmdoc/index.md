# llmdoc Index

## Purpose
- This file is the global map of the llmdoc system for this repository.
- Startup reading order lives in `llmdoc/startup.md`.

## Categories
- `must/`: short recurring cold-start context and routing rules for almost every task
- `overview/`: project identity, boundaries, and major areas
- `architecture/`: workflow orchestration, ownership boundaries, and invariants
- `guides/`: workflow-specific instructions for recurring maintenance tasks
- `reference/`: stable lookup facts about repo surfaces and conventions
- `memory/`: reflections, decisions, and known doc gaps

## Key Documents
- `llmdoc/startup.md`: ordered startup reading list
- `llmdoc/overview/project-overview.md`: what this repository is and what belongs here
- `llmdoc/architecture/init-investigation-orchestration.md`: how `/llmdoc:init` investigation is expected to fan out and converge
- `llmdoc/architecture/context-lifecycle.md`: cold-start, resume, compact-reentry, startup-pack budget, and L0/L1 routing invariants
- `llmdoc/architecture/update-orchestration.md`: how `/llmdoc:update` uses the commit watermark to detect changes and chooses fast, analysis, or full update paths
- `llmdoc/guides/updating-init-investigation-depth.md`: how to change init depth safely when the workflow is too shallow or too broad
- `llmdoc/guides/updating-lifecycle-hooks.md`: how to update lifecycle-aware `SessionStart`, optional compact-prompt/`Stop`, and their verification path
- `llmdoc/guides/updating-update-workflow.md`: how to update the update workflow across Claude Code, Codex, agents, and docs
- `llmdoc/reference/repo-surfaces.md`: stable map of commands, agents, plugin files, and Codex config surfaces

## Routing Rules
- Read `startup.md` first on cold start.
- Read `architecture/init-investigation-orchestration.md` before changing `/llmdoc:init`, agent fan-out strategy, or Codex agent limits.
- Read `architecture/context-lifecycle.md` and `guides/updating-lifecycle-hooks.md` before changing compact re-entry behavior, startup-pack sizing, `LLMDOC_STATE`, bundled hooks, or lifecycle verification.
- Read `guides/updating-init-investigation-depth.md` before tuning investigation breadth or follow-up passes.
- Read `architecture/update-orchestration.md` and `guides/updating-update-workflow.md` before changing `/llmdoc:update`, `llmdoc-update`, the commit-watermark change detection, investigator scratch behavior, or recorder update rules.
- Read `reference/repo-surfaces.md` before moving or renaming public repo surfaces such as commands, agents, plugin files, or `.codex/config.toml`.
- `llmdoc/state/sync.md` is machine-managed commit-watermark state, not knowledge: `recorder` is its sole writer; never index it here or in `startup.md`/`must/`.

## Memory
- `llmdoc/memory/reflections/`: task-specific lessons and mistakes
- `llmdoc/memory/decisions/`: durable design or workflow decisions
- `llmdoc/memory/doc-gaps.md`: known weaknesses in current documentation
