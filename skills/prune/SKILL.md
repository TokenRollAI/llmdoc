---
name: prune
description: "Explicit V3 convergence pass that removes duplicated or fragmented llmdoc knowledge."
argument-hint: "[--scope <topic|path...>] [summary]"
---

# /llmdoc:prune

Use this command only when existing `llmdoc/` knowledge needs convergence after growth, duplication, or fragmentation.

Load the `llmdoc` skill before broad exploration.

## Authorization

An explicit `/llmdoc:prune` invocation authorizes this run to:

- rewrite, merge, or delete stable docs under `llmdoc/`
- update `llmdoc/meta.json`
- write temporary investigation notes under `.llmdoc-tmp/investigations/` when needed

This command does not authorize source-code edits.

## Preconditions

- `git status -- llmdoc/` must be clean before the first formal write.
- Rollback means `git checkout -- llmdoc/` (plus deleting any newly created files under `llmdoc/`); never hand-edit files back.
- If `npx --no-install llmdoc validate` fails after pruning writes and cannot be repaired in-run, roll back the prune write-set before reporting failure.

## Workflow

1. Run `npx --no-install llmdoc prune --report`.
   - Use the report as the primary convergence signal.

2. Decide the convergence plan with `recorder`.
   - Merge duplicated docs.
   - Rewrite fragmented docs when a clearer topic boundary exists.
   - Delete docs only when their knowledge is preserved elsewhere or proven obsolete.

3. Re-validate the result.
   - Run `npx --no-install llmdoc validate`.
   - Re-run `npx --no-install llmdoc prune --report` and compare document/token scale with the first report.
   - Confirm the surviving union of `code.paths` has not lost covered implementation paths.
   - Finalize with `npx --no-install llmdoc commit -m "<message>"`, which fingerprints the surviving docs and lands the `meta.json` follow-up commit automatically.
   - Report `success` and refresh convergence only when scale actually declines without coverage loss; otherwise repair, roll back, or report `no_change` as appropriate.

## State Invariants

- `prune` updates convergence state only on successful validated convergence.
- `prune` must not advance the full baseline unless it explicitly performs a full successful sync as part of the same run.
- Per-document fingerprint updates happen only for the docs that survived or replaced prior docs.

## Result Contract

- `success`: convergence work completed, validated, and convergence state updated.
- `no_change`: the declared scope was fully verified and no justified convergence action remained.
- `dry_run`: the user asked for a dry run, or only `prune --report`/planning output was produced without writing `llmdoc/`; do not advance state.
- `incomplete`: evidence was insufficient, user input is required, or the request belongs to a different explicit workflow; roll back writes and do not advance state.
- `failed`: prune failed and writes were rolled back.

Always report:

- the `prune --report` signal that justified the run
- which docs were merged, rewritten, or deleted
- the `validate` result
- whether convergence improved without losing coverage
