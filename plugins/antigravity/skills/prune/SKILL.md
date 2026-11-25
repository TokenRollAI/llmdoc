---
name: prune
description: "Explicit V3 convergence pass that removes duplicated, fragmented, or low-value reconstructable llmdoc content."
argument-hint: "[--scope <topic|path...>] [summary]"
---

# /llmdoc:prune

Use this command only when existing `llmdoc/` knowledge needs convergence after growth, duplication, fragmentation, or accumulation of reconstructable implementation inventory.

Load the `llmdoc` skill before broad exploration. CLI commands below run as `npx -y @tokenroll/llmdoc <cmd>`.

## Authorization

An explicit `/llmdoc:prune` invocation authorizes this run to:

- rewrite, merge, or delete stable docs under `llmdoc/`
- update `llmdoc/meta.json`
- write temporary investigation notes under `.llmdoc-tmp/investigations/` when needed

This command does not authorize source-code edits.

## Preconditions

- `git status -- llmdoc/` must be clean before the first formal write.
- Rollback means `git checkout -- llmdoc/` (plus deleting any newly created files under `llmdoc/`); never hand-edit files back.
- If `validate` fails after pruning writes and cannot be repaired in-run, roll back the prune write-set before reporting failure.

## Workflow

1. Run `prune --report`.
   - Use the report as the primary mechanical signal for scale, duplication, and fragmentation.
   - The CLI only reports; it never rewrites docs on its own.
   - A clean duplicate/fragment report does not prove good knowledge density; semantic review remains the recorder's job.

2. Decide the convergence plan with `recorder`.
   - If the plan moves ownership, changes topic boundaries, or merges/splits documents, read [Knowledge Topology and Context Floor](../llmdoc/references/knowledge-topology.md) before rewriting.
   - Read [Startup Configuration](../llmdoc/references/startup-config.md) when the report lists startup preload references. Update or remove affected config entries in the same write set before merging or deleting their documents; `mv` handles direct renames automatically.
   - Merge duplicated docs.
   - Rewrite fragmented docs when a clearer topic boundary exists.
   - Apply the Stable Knowledge Gate sentence by sentence. Remove command/file inventories, current-state evidence, and other facts that a reader can cheaply recover from canonical sources.
   - Preserve decisions and rationale, boundaries, invariants, cross-module contracts, non-obvious failures, and risky repeatable workflows.
   - Keep a transitional fact only when omission would be unsafe, and record the condition that retires it.
   - Delete a document when it has no unique durable knowledge; canonical source, schema, help, or tests are valid destinations for discarded evidence. Do not copy low-value content elsewhere merely to justify deletion.

3. Re-validate the result.
   - Confirm every configured startup preload still targets the surviving owner document.
   - Run `validate`.
   - When ownership or routing changed, run the reference's scoped concept, per-file owner, broad-glob precision, and prerequisite checks; structural validation alone is insufficient.
   - Re-run `prune --report` and compare document/token scale with the first report.
   - Confirm surviving stable concepts retain accurate `code.paths`. Do not attach unrelated paths merely to preserve a coverage metric; call out any intentional coverage reduction.
   - Finalize with `commit -m "<message>"`, which fingerprints the surviving docs and lands the `meta.json` follow-up commit automatically.
   - Report `success` only when durable knowledge density or routing materially improves. Refresh convergence only when scale declines without losing justified mappings; otherwise repair, roll back, or report `no_change` as appropriate.

## State Invariants

- `prune` updates convergence state only on successful validated convergence.
- `prune` must not advance the full baseline unless it explicitly performs a full successful sync as part of the same run.
- Per-document fingerprint updates happen only for the docs that survived or replaced prior docs.

## Result Contract

- `success`: knowledge density or routing materially improved, the result validated, and convergence state was updated when applicable.
- `no_change`: the declared scope was fully verified and no justified convergence action remained.
- `dry_run`: the user asked for a dry run, or only `prune --report`/planning output was produced without writing `llmdoc/`; do not advance state.
- `incomplete`: evidence was insufficient, user input is required, or the request belongs to a different explicit workflow; roll back writes and do not advance state.
- `failed`: prune failed and writes were rolled back.

Always report:

- the `prune --report` signal that justified the run
- which docs were merged, rewritten, or deleted
- the `validate` and `commit` results
- how reconstructable evidence was reduced without losing durable decisions or contracts
