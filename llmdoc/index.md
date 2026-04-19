# llmdoc Index

## Purpose
- This file is the global map of the llmdoc system for this repository.
- Startup reading order lives in `llmdoc/startup.md`.

## Categories
- `must/`: short recurring startup context for almost every task
- `overview/`: project identity, boundaries, and major areas
- `architecture/`: workflow orchestration, ownership boundaries, and invariants
- `guides/`: workflow-specific instructions for recurring maintenance tasks
- `reference/`: stable lookup facts about repo surfaces and conventions
- `memory/`: reflections, decisions, and known doc gaps

## Key Documents
- `llmdoc/startup.md`: ordered startup reading list
- `llmdoc/overview/project-overview.md`: what this repository is and what belongs here
- `llmdoc/architecture/init-investigation-orchestration.md`: how `/llmdoc:init` fan-out, coverage gates, follow-up, and repo exclusions are expected to work
- `llmdoc/guides/init-user-calibration.md`: how `/llmdoc:init` should collect and use the two required user calibration steps
- `llmdoc/guides/updating-init-investigation-depth.md`: how to change init depth, follow-up behavior, and repository-size thresholds safely
- `llmdoc/reference/repo-surfaces.md`: stable map of commands, agents, plugin files, and Codex config surfaces

## Routing Rules
- Read `startup.md` first on normal work.
- Read `architecture/init-investigation-orchestration.md` before changing `/llmdoc:init`, agent fan-out strategy, follow-up gates, repository-size thresholds, exclusion rules, or Codex agent limits.
- Read `guides/init-user-calibration.md` before changing `/llmdoc:init` user questions, confirmation checkpoints, or evidence-vs-user-input rules.
- Read `guides/updating-init-investigation-depth.md` before tuning investigation breadth, follow-up passes, or repository-size thresholds.
- Read `reference/repo-surfaces.md` before moving or renaming public repo surfaces such as commands, agents, plugin files, or `.codex/config.toml`.

## Memory
- `llmdoc/memory/reflections/`: task-specific lessons and mistakes
- `llmdoc/memory/decisions/`: durable design or workflow decisions
- `llmdoc/memory/doc-gaps.md`: known weaknesses in current documentation
