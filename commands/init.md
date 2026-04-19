---
description: "Initialize or re-bootstrap llmdoc using evidence-first investigation with required user calibration checkpoints."
---

# /llmdoc:init

Use this command to initialize `llmdoc/` for a project, or to re-bootstrap an incomplete llmdoc tree.

Before executing the workflow, load the `llmdoc` skill.

Why:

- the skill defines the docs-first operating model
- the skill explains the recommended llmdoc structure and templates
- this command should focus on orchestration, not duplicate the full methodology

## Actions

1. Inspect the project root.
   - Read top-level manifests and README files.
   - Exclude dependency, generated, cache, and VCS directories throughout init. At minimum, ignore `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `vendor/`, and `.git/`.
   - Estimate repository size from first-party source files and tests after those exclusions. Do not count lockfiles, generated artifacts, vendored code, or cache directories toward LOC thresholds.
   - Use that LOC estimate to classify the repo as:
     - small: `<= 1000 LOC`
     - medium: `1001-5000 LOC`
     - large: `> 5000 LOC`

2. Create or repair the llmdoc skeleton.
   - Ensure these directories exist:
     - `llmdoc/startup.md`
     - `llmdoc/must/`
     - `llmdoc/overview/`
     - `llmdoc/architecture/`
     - `llmdoc/guides/`
     - `llmdoc/reference/`
     - `llmdoc/memory/reflections/`
     - `llmdoc/memory/decisions/`
     - `.llmdoc-tmp/investigations/`

3. Run the pre-investigation user calibration.
   - This step is required, but the user may skip it by pressing Enter with no extra reply.
   - If the environment supports explicit options, `No extra context, continue` may still be shown, but a blank reply should be treated the same way.
   - If the user presses Enter with no extra reply, continue with repository evidence.
   - This is one of the only valid points where init may pause and wait for user input. Make it explicit that init is waiting for calibration, not finished.
   - Only ask for four kinds of context:
     - who the project is for
     - what the core purpose or core functions are
     - which internal terms are specific to this team or project rather than generic concepts
     - which conventions or boundaries are not obvious from the repo but should affect document structure
   - Keep this interaction short. Do not open a broad interview.
   - Treat the answers as calibration for investigation scope, terminology, and document structure.
   - Persist the current calibration state under `.llmdoc-tmp/investigations/`.

4. Run investigation.
   - Use `investigator` for evidence gathering.
   - In Claude Code, background investigators are an internal execution detail. Do not treat investigator launch as a completion point.
   - Do not hand control back to the user while init is still collecting investigation results, consolidating coverage, running follow-up, generating stable docs, synchronizing the index, or cleaning `.llmdoc-tmp/`, unless explicit user input is required.
   - The only valid user-facing pause points during init are:
     - the pre-investigation calibration
     - the post-investigation confirmation
     - the final completion summary after stable docs, index sync, and cleanup are done
   - Feed the confirmed calibration context and user hints into the investigation plan when they improve coverage or document structure.
   - Default to multiple focused investigators instead of one broad investigator pass, but cap fan-out by repository size:
     - small: `1-2` investigators
     - medium: `2-3` investigators
     - large: `3-5` investigators
   - Bias toward coverage, not just speed. `init` should leave a reusable retrieval map, not only enough facts to draft a first document set.
   - Split by theme, not by random directories. Good slices include repo shape and entrypoints, runtime architecture, feature areas, tests and quality signals, and delivery or ops surfaces when present.
   - Explicitly cover the major repo surfaces that exist. At minimum, consider public interface docs, command contracts, agent prompts, runtime or tool configuration, quality signals, and integration surfaces.
   - Keep theme coverage stable even when fan-out is capped. Merge secondary slices into the main assistant or a quick pass instead of dropping them.
   - Prefer `depth=deep` for the core investigation slices. Use `depth=quick` only for clearly secondary slices.
   - Do not inspect excluded dependency, generated, cache, or VCS directories during investigation or follow-up.
   - Persist reports under `.llmdoc-tmp/investigations/`.
   - Do not wait for the repository to be "large enough" before splitting. Split whenever doing so will produce better coverage or clearer retrieval maps.
   - If Claude Code returns foreground control after launching background investigators, immediately continue by waiting for results, checking written investigation reports, and advancing toward the coverage gate. Do not present init as finished.
   - If the current fan-out would cause Claude Code to expose an unfinished init as if it were done, reduce investigator count and continue in a more foreground-stable way instead of preserving maximum parallelism.
   - While investigators are still running, report status in progress language such as "init is still running" and "waiting for investigator results". Do not imply completion, and do not invite the user to start a new task.
   - After the first wave, run a coverage gate before deciding on follow-up. The gate should check:
     - whether the key themes were covered
     - whether investigator conclusions still conflict
     - whether user supplements that affect document structure or terminology have been verified
     - whether major document-structure ambiguity still remains
     - whether any unresolved uncertainty has been downgraded to an explicit gap instead of a hidden assumption
   - For small and medium repositories, use the coverage gate to choose one of these outcomes:
     - pass: continue to stable-doc generation
     - pass with gaps: continue, but preserve the remaining uncertainty as explicit gaps
     - targeted follow-up required: run another investigation pass scoped only to the open gaps
   - For large repositories, always run the first coverage gate before follow-up. Use it to prepare one targeted follow-up brief by default, then rerun the same gate after that pass to choose the outcomes above.
   - Scope every follow-up pass to a brief that contains only `missing_topics`, `conflicts`, `user_supplements_to_verify`, and `doc_structure_risks`.
   - Follow-up must only check missing evidence. Do not re-run the whole repo, re-open all themes, or revisit already settled conclusions.
   - Choose follow-up defaults by repository size:
     - small: follow-up is conditional and should use at most `0-1` investigators
     - medium: follow-up is conditional and should use at most `1-2` investigators
     - large: after the first coverage gate prepares the brief, run one targeted follow-up pass by default, then use the rerun gate to decide whether to continue; use at most `1-3` investigators per follow-up pass
   - Before handing off to `recorder`, consolidate what was covered, what was intentionally skipped, and what remains uncertain. Missing evidence should become an explicit gap, not a silent omission.
   - Treat these reports as scratch artifacts for bootstrapping, not stable project memory.

5. Run the required post-investigation confirmation.
   - Prepare a concise concept list of what is about to enter the record and influence stable docs.
   - Include the current understanding of project purpose and audience, core functions, identified internal terms, conventions or boundaries that affect document structure, and the document emphasis the first stable pass is about to prioritize.
   - This is one of the only valid points where init may pause and wait for user input. Make it explicit that init is paused for confirmation and has not finished yet.
   - Show only two user actions:
     - `Generate docs now`
     - `I want to add: terms | emphasis | conventions`
   - If the user adds information, accept only that scoped supplement instead of reopening a broad interview.
   - Route user supplements through the same targeted follow-up and coverage-gate mechanism. Only verify the requested terms, emphasis, conventions, and directly related evidence.
   - Do not restart the full investigation after user feedback. Follow-up should only fill the open gap and then return to this confirmation step.
   - Keep implementation facts evidence-first. User input may refine positioning, terminology, and structure, but it should not override repository evidence about behavior or ownership.
   - Do not treat unverified or conflicting claims as stable facts. Keep them as scratch notes or explicit gaps until evidence is strong enough.

6. Generate the initial stable docs with `recorder`.
   - `recorder` should directly read the relevant raw investigation reports under `.llmdoc-tmp/investigations/` before writing stable docs. Do not rely only on second-hand summaries from the coordinating assistant.
   - Synthesize across all investigation reports, not just the first one that looks complete.
   - Use user-confirmed project-positioning information when it improves retrieval quality, terminology, and document structure.
   - Treat uncovered major areas as documentation gaps to record, not as proof that those areas do not matter.
   - Create `llmdoc/index.md` as the global documentation map.
   - Create `llmdoc/startup.md`.
   - Create a small set of MUST docs for recurring startup context.
   - Ensure `llmdoc/index.md` does not duplicate the ordered startup list in `llmdoc/startup.md`.
   - Ensure `llmdoc/startup.md` does not duplicate the global category catalog from `llmdoc/index.md`.
   - Create `llmdoc/overview/project-overview.md`.
   - In the first stable pass, prioritize 2-3 core architecture or reference docs that capture the system's deepest invariants, flows, and contracts. Do not spread the first pass across many shallow documents.
   - Create focused architecture and reference docs based on the investigation reports, then expand into additional smaller docs only after the core docs are deep enough to stand on their own.
   - Treat document length as a quality tradeoff, not a hard limit. If a core doc needs more space to preserve causal flow, invariants, and terminology, keep it cohesive before splitting.

7. Synchronize `llmdoc/index.md`.
   - Index all stable docs.
   - Keep `memory/reflections/` and `memory/decisions/` separate from stable docs.
   - Do not treat `.llmdoc-tmp/` as part of llmdoc.

8. Remove `.llmdoc-tmp/`.
   - Delete the temporary investigation artifacts after the stable docs and index are complete.
   - Do not leave `.llmdoc-tmp/` behind after a successful init run.

9. Summarize what was created and where the main startup docs live.
