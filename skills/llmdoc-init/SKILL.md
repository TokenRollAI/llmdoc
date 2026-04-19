---
name: llmdoc-init
description: "Codex-native entry skill for bootstrapping llmdoc. Use this when you want the /llmdoc:init workflow in Codex."
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# llmdoc-init

This skill is the Codex-native equivalent of `/llmdoc:init`.

Use it when:

- the repository does not have `llmdoc/` yet
- the existing `llmdoc/` tree is incomplete or stale
- you want a command-like Codex entrypoint for bootstrapping docs

Before broad exploration, follow the `llmdoc` operating model:

- prefer docs first, code and config second
- align with the user before non-trivial edits
- keep temporary investigation artifacts under `.llmdoc-tmp/`

Then execute this workflow:

1. Inspect the project root.
   - Read top-level manifests and README files.
   - Exclude dependency, generated, cache, and VCS directories throughout init. At minimum, ignore `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `vendor/`, and `.git/`.
   - Estimate repository size from first-party source files and tests after those exclusions. Do not count lockfiles, generated artifacts, vendored code, or cache directories toward LOC thresholds.
   - Use that LOC estimate to classify the repo as small (`<= 1000 LOC`), medium (`1001-5000 LOC`), or large (`> 5000 LOC`).

2. Create or repair the llmdoc skeleton.
   - Ensure these paths exist:
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
   - Continue with repository evidence when the user presses Enter with no extra reply.
   - This is one of the only valid points where init may pause and wait for user input. Make it explicit that init is waiting for calibration, not finished.
   - Limit the interaction to four kinds of context: who the project is for, what the core purpose or core functions are, which internal terms are team-specific rather than generic, and which hidden conventions or boundaries should affect document structure.
   - Keep the interaction short and use it only to calibrate investigation scope, terminology, and document structure.
   - Persist the current calibration state under `.llmdoc-tmp/investigations/`.

4. Run investigation.
   - In Claude Code, background investigators are an internal execution detail. Do not treat investigator launch as a completion point.
   - Do not hand control back to the user while init is still collecting investigation results, consolidating coverage, running follow-up, generating stable docs, synchronizing the index, or cleaning `.llmdoc-tmp/`, unless explicit user input is required.
   - The only valid user-facing pause points during init are the pre-investigation calibration, the post-investigation confirmation, and the final completion summary after stable docs, index sync, and cleanup are done.
   - Feed the confirmed calibration context and user hints into the investigation plan when they improve coverage or document structure.
   - Prefer multiple focused investigators over one broad pass.
   - Cap the first-wave fan-out by repository size:
     - small: `1-2` investigators
     - medium: `2-3` investigators
     - large: `3-5` investigators
   - Split by theme, not by random directories.
   - Keep theme coverage stable even when fan-out is capped. Merge secondary slices instead of dropping them.
   - Do not inspect excluded dependency, generated, cache, or VCS directories during investigation or follow-up.
   - If Claude Code returns foreground control after launching background investigators, immediately continue by waiting for results, checking written investigation reports, and advancing toward the coverage gate. Do not present init as finished.
   - If the current fan-out would cause Claude Code to expose an unfinished init as if it were done, reduce investigator count and continue in a more foreground-stable way instead of preserving maximum parallelism.
   - While investigators are still running, report status in progress language such as "init is still running" and "waiting for investigator results". Do not imply completion, and do not invite the user to start a new task.
   - After the first wave, run a coverage gate that checks for missing topics, unresolved conflicts, unverified user supplements, document-structure risks, and hidden assumptions that should become explicit gaps.
   - For small and medium repositories, use the coverage gate to choose `pass`, `pass with gaps`, or `targeted follow-up required`.
   - For large repositories, always run the first coverage gate before follow-up. Use it to prepare one targeted follow-up brief by default, then rerun the same gate after that pass.
   - Scope every follow-up pass to `missing_topics`, `conflicts`, `user_supplements_to_verify`, and `doc_structure_risks`.
   - Follow-up must only fill gaps. Do not re-run the whole repo or reopen already settled themes.
   - Choose follow-up defaults by repository size:
     - small: conditional, at most `0-1` investigators
     - medium: conditional, at most `1-2` investigators
     - large: after the first coverage gate prepares the brief, run one targeted follow-up pass by default, then let the rerun gate decide whether to continue; at most `1-3` investigators per follow-up pass
   - Treat investigation output as scratch material, not stable project memory.

5. Run the required post-investigation confirmation.
   - Show the concept list that is about to enter the record and influence stable docs.
   - This is one of the only valid points where init may pause and wait for user input. Make it explicit that init is paused for confirmation and has not finished yet.
   - Offer only `Generate docs now` or `I want to add: terms | emphasis | conventions`.
   - If the user adds information, accept only that scoped supplement, route it through the same targeted follow-up and coverage gate, and then repeat the confirmation step.
   - Keep implementation facts evidence-first. User input may refine positioning, terminology, and structure, but it should not override repository evidence about behavior or ownership.
   - Keep unverified or conflicting claims out of stable docs until evidence is strong enough.

6. Generate the initial stable docs.
   - Create `llmdoc/index.md` as the global doc map.
   - Create `llmdoc/startup.md`.
   - Create a small set of MUST docs.
   - Create `llmdoc/overview/project-overview.md`.
   - Create focused architecture and reference docs from the strongest investigation slices first.

7. Synchronize `llmdoc/index.md`.
   - Index stable docs.
   - Keep `memory/reflections/` and `memory/decisions/` separate from stable docs.
   - Do not treat `.llmdoc-tmp/` as part of llmdoc.

8. Remove `.llmdoc-tmp/`.
   - Delete the temporary investigation artifacts after the stable docs and index are complete.
   - Do not leave `.llmdoc-tmp/` behind after a successful init run.

9. Summarize what was created and where the startup docs live.

If the repository already contains `llmdoc/`, read `llmdoc/index.md`, `llmdoc/startup.md`, and the listed MUST docs before making broader changes.
