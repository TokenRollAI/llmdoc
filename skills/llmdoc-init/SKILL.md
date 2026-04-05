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
   - Avoid dependency and build directories.

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

3. Run investigation.
   - Prefer multiple focused investigators over one broad pass.
   - On most non-trivial repositories, start with 3-5 focused slices.
   - Split by theme, not by random directories.
   - Run at least one follow-up pass for gaps, conflicts, and cross-cutting relationships.
   - Treat investigation output as scratch material, not stable project memory.

4. Generate the initial stable docs.
   - Create `llmdoc/index.md` as the global doc map.
   - Create `llmdoc/startup.md`.
   - Create a small set of MUST docs.
   - Create `llmdoc/overview/project-overview.md`.
   - Create focused architecture and reference docs from the strongest investigation slices first.

5. Synchronize `llmdoc/index.md`.
   - Index stable docs.
   - Keep `memory/reflections/` and `memory/decisions/` separate from stable docs.
   - Do not treat `.llmdoc-tmp/` as part of llmdoc.

6. Summarize what was created and where the startup docs live.

If the repository already contains `llmdoc/`, read `llmdoc/index.md`, `llmdoc/startup.md`, and the listed MUST docs before making broader changes.
