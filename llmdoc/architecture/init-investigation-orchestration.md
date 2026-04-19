# Architecture of Init Investigation Orchestration

## Purpose
- Define how `/llmdoc:init` should expand investigation work so the first documentation bootstrap stays reusable without imposing large-repo cost on small repositories.
- Define the minimum expectation for investigation coverage so bootstrap docs do not inherit blind spots from a narrow first pass.
- Define where required user calibration should shape init without weakening evidence-first behavior.

## Core Components
- `commands/init.md` (`/llmdoc:init`): The main orchestration contract for repository inspection, investigation, and stable doc generation.
- `agents/investigator.md` (`investigator`): The evidence-gathering role used for targeted codebase and doc investigation.
- `agents/recorder.md` (`recorder`): The stable-doc writer that must preserve investigation depth instead of flattening it into thin summaries.
- `.codex/config.toml` (`[agents]`): Global Codex agent limits that can silently cap fan-out depth and concurrency.
- `README.md` (`/llmdoc:init`): English public summary of the init workflow.
- `README.zh-CN.md` (`/llmdoc:init`): Chinese public summary of the init workflow.

## Flow
- Inspect the repository root, exclude dependency or generated directories, estimate relevant LOC, and classify the repo as small (`<= 1000 LOC`), medium (`1001-5000 LOC`), or large (`> 5000 LOC`).
- Create the llmdoc skeleton.
- Run a required pre-investigation calibration step. The assistant must always offer `No extra context, continue` as an explicit option.
- Keep the pre-investigation calibration narrow. It should cover project audience, core purpose or core functions, internal team-specific terms, and conventions or boundaries that should affect document structure.
- Enumerate the thematic investigation slices before assigning subagents.
- Start a first wave of focused investigators with size-aware fan-out:
  - small: `1-2`
  - medium: `2-3`
  - large: `3-5`
- Split by theme instead of arbitrary directories. Typical slices are repo shape and entrypoints, runtime architecture, feature areas, tests and quality signals, and delivery or ops surfaces when present.
- Make coverage explicit. The init flow should deliberately touch the major repo surfaces that exist rather than assuming a few deep slices are enough.
- Keep all major themes in scope even when the size cap is lower than the number of ideal slices. Merge secondary slices into the coordinating assistant or a quick pass instead of dropping them.
- Prefer `depth=deep` for core slices and use `depth=quick` only for clearly secondary slices.
- Run a coverage gate after the first wave. The gate should check key-theme coverage, unresolved conflicts, unverified user supplements, document-structure risks, and whether remaining uncertainty has been downgraded to explicit gaps.
- For small and medium repositories, let the first coverage gate either pass directly or trigger follow-up only when it fails.
- For large repositories, let the first coverage gate prepare one targeted follow-up brief by default, then use the same gate after that pass to decide whether more follow-up is needed.
- Scope each follow-up pass to a brief containing only `missing_topics`, `conflicts`, `user_supplements_to_verify`, and `doc_structure_risks`.
- Treat follow-up as a targeted repair phase. It should never re-run the whole repo or re-open already settled themes.
- Before synthesis, consolidate covered slices, intentionally skipped areas, and unresolved uncertainty so `recorder` sees both knowledge and gaps.
- Run a required post-investigation confirmation before stable-doc generation.
- The post-investigation confirmation should show a concise concept list and only two actions: generate now, or add terms, emphasis, or conventions.
- If user supplements reveal unresolved ambiguity, send them through the same targeted follow-up and coverage-gate path instead of restarting the whole init flow.
- Let `recorder` directly read the raw investigation reports and synthesize across all investigation outputs instead of trusting a single broad report or a second-hand summary.
- In the first stable pass, let `recorder` produce a small number of deep core docs before expanding into narrower retrieval docs.

## Invariants
- `/llmdoc:init` should always offer the pre-investigation calibration step and explicitly show `No extra context, continue`.
- `/llmdoc:init` should always require a post-investigation confirmation before stable-doc generation.
- Both user interactions should stay narrow and decision-oriented instead of turning into a broad interview.
- `/llmdoc:init` should not default to a single broad investigation pass on non-trivial repositories.
- `/llmdoc:init` should not treat partial slice coverage as "comprehensive enough" without an explicit coverage check.
- `/llmdoc:init` should use repository-size thresholds to cap fan-out, not to remove themes from coverage.
- `/llmdoc:init` should exclude dependency, generated, cache, and VCS directories from sizing and investigation.
- `/llmdoc:init` should treat follow-up as targeted gap resolution, not as a second full-repo pass.
- `/llmdoc:init` should not flatten deep investigation into many shallow stable docs during the first pass.
- `/llmdoc:init` should not write unverified or conflicting user claims into stable docs as facts.
- Investigation scratch belongs in `.llmdoc-tmp/investigations/`.
- Public docs and command contracts should describe the same init behavior.
- Codex agent limits should allow at least one level of follow-up investigation rather than capping the workflow at depth `1`.

## Related Docs
- `llmdoc/guides/init-user-calibration.md`
- `llmdoc/guides/updating-init-investigation-depth.md`
- `llmdoc/reference/repo-surfaces.md`
- `llmdoc/memory/reflections/2026-04-05-init-subagent-depth.md`
