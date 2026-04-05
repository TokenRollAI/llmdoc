---
description: "Initialize or re-bootstrap llmdoc using the minimal init workflow."
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
   - Avoid dependency and build directories.

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

3. Run investigation.
   - Use `investigator` for evidence gathering.
   - Default to multiple focused investigators instead of one broad investigator pass.
   - On most non-trivial repositories, start with 3-5 parallel investigators.
   - Split by theme, not by random directories. Good slices include repo shape and entrypoints, runtime architecture, feature areas, tests and quality signals, and delivery or ops surfaces when present.
   - Prefer `depth=deep` for the core investigation slices. Use `depth=quick` only for clearly secondary slices.
   - Persist reports under `.llmdoc-tmp/investigations/`.
   - Do not wait for the repository to be "large enough" before splitting. Split whenever doing so will produce better coverage or clearer retrieval maps.
   - After the first wave, run at least one follow-up investigation pass to resolve gaps, conflicts, and cross-cutting relationships discovered by the initial investigators.
   - Treat these reports as scratch artifacts for bootstrapping, not stable project memory.

4. Generate the initial stable docs with `recorder`.
   - Synthesize across all investigation reports, not just the first one that looks complete.
   - Create `llmdoc/index.md` as the global documentation map.
   - Create `llmdoc/startup.md`.
   - Create a small set of MUST docs for recurring startup context.
   - Ensure `llmdoc/index.md` does not duplicate the ordered startup list in `llmdoc/startup.md`.
   - Ensure `llmdoc/startup.md` does not duplicate the global category catalog from `llmdoc/index.md`.
   - Create `llmdoc/overview/project-overview.md`.
   - Create focused architecture and reference docs based on the investigation reports.
   - Split aggressively. Prefer several small docs over one large one.

5. Synchronize `llmdoc/index.md`.
   - Index all stable docs.
   - Keep `memory/reflections/` and `memory/decisions/` separate from stable docs.
   - Do not treat `.llmdoc-tmp/` as part of llmdoc.

6. Summarize what was created and where the main startup docs live.
