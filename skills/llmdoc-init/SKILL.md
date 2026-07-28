---
name: llmdoc-init
description: "Codex-native entry skill for bootstrapping llmdoc. Use this when you want the /llmdoc:init workflow in Codex."
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
     - `llmdoc/state/sync.md`
     - `.llmdoc-tmp/investigations/`
   - Seed the commit watermark in `llmdoc/state/sync.md` (template in `skills/llmdoc/references/templates.md`): set `watermark-commit` to `$(git rev-parse HEAD)`, so the first `llmdoc-update` has a valid anchor. Skip this in a non-git project. `llmdoc/state/sync.md` is machine-managed state, not knowledge: never index it or add it to `startup.md`/`must/`.

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
   - Make the startup pack cold-start-only and keep `index.md` + `startup.md` + `must/` under 24 KiB by default.
   - In a monolith, use the root index as an L0 router and add subsystem indexes instead of listing every leaf document.
   - Create `llmdoc/overview/project-overview.md`.
   - Create focused architecture and reference docs from the strongest investigation slices first.

5. Synchronize `llmdoc/index.md`.
   - Index stable docs directly only when the repository is small; otherwise index subsystem routers that lead to leaf documents.
   - Keep `memory/reflections/` and `memory/decisions/` separate from stable docs.
   - Do not treat `.llmdoc-tmp/` as part of llmdoc.

6. Summarize what was created and where the startup docs live.

If the repository already contains `llmdoc/`, read `llmdoc/index.md`, `llmdoc/startup.md`, and the listed MUST docs once on cold start before making broader changes. After context compaction, resume from `LLMDOC_STATE` instead of replaying that package.
