---
name: init
description: >-
  Explicit V3 bootstrap for repositories that do not already have valid llmdoc
  knowledge.
---

# /llmdoc:init

Use this command only when the repository does not already have valid V3 `llmdoc/`.

Load the `llmdoc` skill before broad exploration. CLI commands below run as `npx -y @tokenroll/llmdoc <cmd>`.

## Authorization

An explicit `/llmdoc:init` invocation authorizes this run to:

- create `llmdoc/`, `.llmdoc-tmp/`, and `llmdoc/meta.json`
- write stable docs only through `recorder`
- write temporary investigation reports under `.llmdoc-tmp/investigations/`

Stop instead of improvising when:

- V3 `llmdoc/` already exists: tell the user to run `/llmdoc:update`
- a legacy layout already exists: stop and require the dedicated legacy-migration command

## Preconditions

- `git status -- llmdoc/` must be clean before the first formal write.
- Rollback for init means deleting the newly created `llmdoc/` surface (it did not exist before this run); never leave a half-bootstrapped tree behind.
- If `validate` fails after writes, revert the init write-set before reporting failure.

## Workflow

1. Inventory the repository surface.
   - Before choosing boundaries, read [Knowledge Topology and Context Floor](../llmdoc/references/knowledge-topology.md). Use its domain/topic tests and Context Floor acceptance contract.
   - Read top-level manifests, README files, entrypoints, test surfaces, and release/config files.
   - Use one or more `investigator` subagents for complementary evidence scopes when the repository is large enough to benefit; keep their write ownership in `.llmdoc-tmp/`.
   - Build the reference's scratch domain/owner matrix. Give every first-class subsystem an expected owner document or an explicit no-doc reason; resolve conflicting evidence before handing the result to `recorder`.

2. Build the first V3 knowledge surface with `recorder`.
   - Define topic boundaries before drafting leaf docs.
   - Prefer the smallest sufficient set of high-value owner docs over broad shallow inventory. Depth never excuses a first-class subsystem with neither an owner nor an intentional no-doc decision.
   - Keep stable knowledge in `llmdoc/` and validity state in `llmdoc/meta.json`.
   - Create root singleton docs only for genuinely cross-topic contracts; otherwise create only the necessary one-level topic directories. Topics are plain directories with no `index.mdx` entry node.
   - If the user wants non-default SessionStart guidance, external `sources`, or deliberate document preload, read [Startup Configuration](../llmdoc/references/startup-config.md) and create `llmdoc.config.json`; otherwise do not add optional config during bootstrap.

3. Validate before reporting success.
   - Seed the ledger with `init-state` (writes meta.json with null revisions), then run `validate` and fix all schema, routing, and reference failures.
   - Treat `validate` as structural only. After it passes, run the reference's Context Floor acceptance: natural-query searches, per-boundary `context --files` probes, broad-glob precision probes, and `tree --docs` plus `index`/`context` relation review.
   - Repair missing or imprecise routes before success. An intended owner must be reached directly; a generic root document alone is not sufficient.
   - Docs added after `init-state` already seeded the ledger get their entries via `adopt <path...>`; never hand-edit `meta.json` or recreate existing files through `new`.
   - Finalize with `commit --all -m "docs: bootstrap llmdoc"` — it commits the surface, brands fingerprints, and lands the meta follow-up commit in one step.
   - On a validation failure that cannot be repaired in-run, roll back the init write-set.

## State Invariants

- Init seeds the baseline only for a successful full bootstrap.
- Per-document fingerprint updates happen only after successful writes and validation.
- A successful bootstrap seeds the initial convergence snapshot with `source: init`; failed, incomplete, and dry-run paths never change it.

## Result Contract

- `success`: V3 surface created, validated, and baseline initialized.
- `no_change`: the declared scope was fully checked and no write was needed.
- `dry_run`: investigation or planning completed without writing `llmdoc/`; do not advance state.
- `incomplete`: init was refused (valid V3 already exists, legacy migration is required) or evidence/user input was insufficient; roll back writes and do not advance state.
- `failed`: bootstrap failed and writes were rolled back.

Always report:

- whether init ran or was refused
- the investigation report path or paths used
- the topics and stable docs created
- the domain/owner matrix outcome, including concept routes, representative file routes, and intentional no-doc decisions
- the `validate` and `commit` results
- any intentionally reconstructable areas or non-blocking follow-ups; an unresolved first-class gap makes init `incomplete`, not `success`
