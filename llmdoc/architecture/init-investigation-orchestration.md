# Architecture of Init Investigation Orchestration

## Purpose
- Define how `/llmdoc:init` should expand investigation work so the first documentation bootstrap stays reusable without imposing large-repo cost on small repositories.
- Define the minimum expectation for investigation coverage so bootstrap docs do not inherit blind spots from a narrow first pass.
- Define where required user calibration should shape init without weakening evidence-first behavior.
- Define how init should recover when background investigators can produce a report but cannot persist it directly.

## Core Components
- `commands/init.md` (`/llmdoc:init`): The main orchestration contract for repository inspection, investigation, and stable doc generation.
- `agents/investigator.md` (`investigator`): The evidence-gathering role used for targeted codebase and doc investigation.
- `agents/recorder.md` (`recorder`): The stable-doc writer that must preserve investigation depth instead of flattening it into thin summaries.
- `.codex/config.toml` (`[agents]`): Global Codex agent limits that cap fan-out depth and concurrency. Current repo values: `max_threads = 8`, `max_depth = 2`. These bound how many investigators can run in parallel and how deep follow-up can nest. Recovery investigators must stay within remaining thread and depth budget.
- `README.md` (`/llmdoc:init`): English public summary of the init workflow.
- `README.zh-CN.md` (`/llmdoc:init`): Chinese public summary of the init workflow.

## Flow
- Inspect the repository root, exclude dependency or generated directories, estimate relevant LOC, and classify the repo as small (`<= 1000 LOC`), medium (`1001-5000 LOC`), or large (`> 5000 LOC`).
- Create the llmdoc skeleton.
- Run a required pre-investigation calibration step. The assistant must always offer `No extra context, continue` as an explicit option.
- Keep the pre-investigation calibration narrow. It should cover project audience, core purpose or core functions, internal team-specific terms, and conventions or boundaries that should affect document structure.
- Enumerate the thematic investigation slices before assigning subagents.
- Assign each file-sink investigation a stable `topic` label and a unique `.llmdoc-tmp/investigations/...` output path before launching the subagent.
- Start a first wave of focused investigators with size-aware fan-out:
  - small: `1-2`
  - medium: `2-3`
  - large: `3-5`
- Split by theme instead of arbitrary directories. Typical slices are repo shape and entrypoints, runtime architecture, feature areas, tests and quality signals, and delivery or ops surfaces when present.
- Make coverage explicit. The init flow should deliberately touch the major repo surfaces that exist rather than assuming a few deep slices are enough.
- Keep all major themes in scope even when the size cap is lower than the number of ideal slices. Merge secondary slices into the coordinating assistant or a quick pass instead of dropping them.
- Prefer `depth=deep` for core slices and use `depth=quick` only for clearly secondary slices.
- Let investigators try to persist their own file-sink reports first with `Write`, not `Bash`.
- Treat `result returned` and `report persisted` as different states.
- Do not treat a `persisted` result as complete until the coordinating assistant verifies the canonical `output_path` exists, is non-empty, and contains the `<!-- llmdoc:eor -->` sentinel.
- If an investigator cannot persist its report, require it to return a structured fallback payload containing `topic`, `output_path`, `sidecar_path`, `failure_type`, `failure_message`, and the full markdown report so the coordinating assistant can write it.
- Require the investigator to always attempt a best-effort sidecar `Write` of the same markdown to `<output_path>.sidecar.md` before returning, regardless of whether the primary write succeeded. Treat the sidecar as a recovery lane that must never block the run if it fails or replace the canonical artifact.
- Let the coordinating assistant immediately persist that fallback report, then verify the file exists, is non-empty, and contains the `<!-- llmdoc:eor -->` sentinel before treating the topic as complete.
- Handle the third observation state `transport_failure`, inferred when the subagent tool call returns an internal error or a missing tool result. On `transport_failure`, the coordinating assistant must first check `output_path` on disk. If `output_path` is missing, empty, or lacks the sentinel, it must then check `<output_path>.sidecar.md`. A valid sidecar is only a recovery source: when the sidecar is complete, copy it back to `output_path`, verify the restored canonical file, and continue only after `output_path` exists, is non-empty, and contains the sentinel. Only rerun when neither path yields a restorable report.
- Handle the fourth observation state `context_overflow`, inferred when the report file exists on disk but the `<!-- llmdoc:eor -->` sentinel is missing. On `context_overflow`, do not rerun the same brief scope. Split the topic into ≤3 narrower sub-briefs and route them through the follow-up slot. Claude Code queues sub-briefs at the platform cap of 10; Codex must stay within the remaining `max_threads` and `max_depth` budget and should prefer serial sub-briefs when budget is tight.
- If the coordinating assistant also cannot write the fallback report or cannot restore `output_path` from a valid sidecar, pause init and ask the user for explicit authorization to write the blocked `.llmdoc-tmp/investigations/` files.
- Run the coverage gate only after every required report in the current batch has been persisted and verified on disk.
- Run a coverage gate after the first wave. The gate should check key-theme coverage, unresolved conflicts, unverified user supplements, document-structure risks, and whether remaining uncertainty has been downgraded to explicit gaps.
- For small and medium repositories, let the first coverage gate either pass directly or trigger follow-up only when it fails.
- For large repositories, let the first coverage gate prepare one targeted follow-up brief by default, then use the same gate after that pass to decide whether more follow-up is needed.
- Scope each follow-up pass to a brief containing only `missing_topics`, `conflicts`, `user_supplements_to_verify`, and `doc_structure_risks`.
- Treat follow-up as a targeted repair phase. It should never re-run the whole repo or re-open already settled themes.
- If persistence becomes unstable during a batch, stabilize the current batch before increasing follow-up fan-out.
- Before synthesis, consolidate covered slices, intentionally skipped areas, and unresolved uncertainty so `recorder` sees both knowledge and gaps.
- Run a required post-investigation confirmation before stable-doc generation.
- The post-investigation confirmation should show a concise concept list and only two actions: generate now, or add terms, emphasis, or conventions.
- If user supplements reveal unresolved ambiguity, send them through the same targeted follow-up and coverage-gate path instead of restarting the whole init flow.
- Let `recorder` directly read the raw investigation reports and synthesize across all investigation outputs instead of trusting a single broad report or a second-hand summary.
- In the first stable pass, let `recorder` produce a size-aware small number of deep core docs before expanding into narrower retrieval docs: usually `2-3` on small and medium repositories, and `3-5` on large repositories.

## Invariants
- `/llmdoc:init` should always offer the pre-investigation calibration step and explicitly show `No extra context, continue`.
- `/llmdoc:init` should always require a post-investigation confirmation before stable-doc generation.
- Both user interactions should stay narrow and decision-oriented instead of turning into a broad interview.
- `/llmdoc:init` should not default to a single broad investigation pass on non-trivial repositories.
- `/llmdoc:init` should not treat partial slice coverage as "comprehensive enough" without an explicit coverage check.
- `/llmdoc:init` should use repository-size thresholds to cap fan-out, not to remove themes from coverage.
- `/llmdoc:init` should exclude dependency, generated, cache, and VCS directories from sizing and investigation.
- `/llmdoc:init` should distinguish `result returned` from `report persisted` and should not treat notification-only results as completed reports.
- `/llmdoc:init` should not treat a missing or internal-error tool result as proof that no report exists. Before rerunning, it must check `output_path` and `<output_path>.sidecar.md` on disk.
- `/llmdoc:init` should not treat a sidecar-only file as `persisted`. It must restore the canonical `output_path` before continuing from a recovered report.
- `/llmdoc:init` should treat a report file without the `<!-- llmdoc:eor -->` sentinel as `context_overflow`, not `persisted`. A truncated report must never silently enter the coverage gate.
- `/llmdoc:init` should not rerun a `context_overflow` topic with the same brief scope. It must split the brief and use the follow-up slot.
- `/llmdoc:init` should not increase concurrent fan-out beyond what the platform can queue or execute when recovering from `context_overflow`. Claude Code queues at 10; Codex is bounded by `max_threads` and `max_depth`.
- `/llmdoc:init` should prefer investigator self-persist, then coordinating-assistant fallback persist, then explicit user authorization if both writes fail.
- `/llmdoc:init` should not rely on `Bash` as the primary persistence path for investigation scratch files.
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
- `llmdoc/memory/reflections/2026-04-20-subagent-transport-failure.md`
