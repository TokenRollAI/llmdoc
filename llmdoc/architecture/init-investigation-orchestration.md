# Architecture of Init Investigation Orchestration

## Purpose
- Define how `/llmdoc:init` should expand investigation work so the first documentation bootstrap is broad enough to be reusable.
- Define the minimum expectation for investigation coverage so bootstrap docs do not inherit blind spots from a narrow first pass.

## Core Components
- `commands/init.md` (`/llmdoc:init`): The main orchestration contract for repository inspection, investigation, and stable doc generation.
- `agents/investigator.md` (`investigator`): The evidence-gathering role used for targeted codebase and doc investigation.
- `agents/recorder.md` (`recorder`): The stable-doc writer that must preserve investigation depth instead of flattening it into thin summaries.
- `.codex/config.toml` (`[agents]`): Global Codex agent limits that can silently cap fan-out depth and concurrency.
- `README.md` (`/llmdoc:init`): English public summary of the init workflow.
- `README.zh-CN.md` (`/llmdoc:init`): Chinese public summary of the init workflow.

## Flow
- Inspect the repository root and create the llmdoc skeleton.
- Start a first wave of focused investigators, usually 3-5 in parallel for non-trivial repositories.
- Split by theme instead of arbitrary directories. Typical slices are repo shape and entrypoints, runtime architecture, feature areas, tests and quality signals, and delivery or ops surfaces when present.
- Make coverage explicit. The init flow should deliberately touch the major repo surfaces that exist rather than assuming a few deep slices are enough.
- Prefer `depth=deep` for core slices and use `depth=quick` only for clearly secondary slices.
- Run a follow-up investigation pass to resolve gaps, conflicts, and cross-cutting relationships discovered by the first wave.
- Before synthesis, consolidate covered slices, intentionally skipped areas, and unresolved uncertainty so `recorder` sees both knowledge and gaps.
- Let `recorder` directly read the raw investigation reports and synthesize across all investigation outputs instead of trusting a single broad report or a second-hand summary.
- In the first stable pass, let `recorder` produce a small number of deep core docs before expanding into narrower retrieval docs.

## Invariants
- `/llmdoc:init` should not default to a single broad investigation pass on non-trivial repositories.
- `/llmdoc:init` should not treat partial slice coverage as "comprehensive enough" without an explicit coverage check.
- `/llmdoc:init` should not flatten deep investigation into many shallow stable docs during the first pass.
- Investigation scratch belongs in `.llmdoc-tmp/investigations/`.
- Public docs and command contracts should describe the same init behavior.
- Codex agent limits should allow at least one level of follow-up investigation rather than capping the workflow at depth `1`.

## Related Docs
- `llmdoc/guides/updating-init-investigation-depth.md`
- `llmdoc/reference/repo-surfaces.md`
- `llmdoc/memory/reflections/2026-04-05-init-subagent-depth.md`
