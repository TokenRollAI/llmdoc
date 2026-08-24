---
name: init
description: "Explicit V3 bootstrap for repositories that do not already have valid llmdoc knowledge."
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
   - Read top-level manifests, README files, entrypoints, test surfaces, and release/config files.
   - Use one or more `investigator` subagents for complementary evidence scopes when the repository is large enough to benefit; keep their write ownership in `.llmdoc-tmp/`.
   - Check coverage and resolve conflicting evidence before handing the result to `recorder`.

2. Build the first V3 knowledge surface with `recorder`.
   - Define topic boundaries before drafting leaf docs.
   - Prefer a small number of high-value docs over broad shallow coverage.
   - Keep stable knowledge in `llmdoc/` and validity state in `llmdoc/meta.json`.
   - Create the V3 root singleton plus one-level topic directories; topics are plain directories with no `index.mdx` entry node.

3. Validate before reporting success.
   - Seed the ledger with `init-state` (writes meta.json with null revisions), then run `validate` and fix all schema, routing, and reference failures.
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
- the `validate` and `commit` results
- any material gaps left for later `/llmdoc:update`
