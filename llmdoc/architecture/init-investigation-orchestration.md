# Architecture of Init Investigation Orchestration

## Purpose
- Define how `/llmdoc:init` should expand investigation work so the first documentation bootstrap is broad enough to be reusable.

## Core Components
- `commands/init.md` (`/llmdoc:init`): The main orchestration contract for repository inspection, investigation, and stable doc generation.
- `agents/investigator.md` (`investigator`): The evidence-gathering role used for targeted codebase and doc investigation.
- `.codex/config.toml` (`[agents]`): Global Codex agent limits that can silently cap fan-out depth and concurrency.
- `README.md` (`/llmdoc:init`): English public summary of the init workflow.
- `README.zh-CN.md` (`/llmdoc:init`): Chinese public summary of the init workflow.

## Flow
- Inspect the repository root and create the llmdoc skeleton.
- Start a first wave of focused investigators, usually 3-5 in parallel for non-trivial repositories.
- Split by theme instead of arbitrary directories. Typical slices are repo shape and entrypoints, runtime architecture, feature areas, tests and quality signals, and delivery or ops surfaces when present.
- Prefer `depth=deep` for core slices and use `depth=quick` only for clearly secondary slices.
- Run a follow-up investigation pass to resolve gaps, conflicts, and cross-cutting relationships discovered by the first wave.
- Let `recorder` synthesize across all investigation outputs instead of trusting a single broad report.

## Invariants
- `/llmdoc:init` should not default to a single broad investigation pass on non-trivial repositories.
- Investigation scratch belongs in `.llmdoc-tmp/investigations/`.
- Public docs and command contracts should describe the same init behavior.
- Codex agent limits should allow at least one level of follow-up investigation rather than capping the workflow at depth `1`.

## Related Docs
- `llmdoc/guides/updating-init-investigation-depth.md`
- `llmdoc/reference/repo-surfaces.md`
- `llmdoc/memory/reflections/2026-04-05-init-subagent-depth.md`
