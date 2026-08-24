---
name: upgrade
description: "Explicit V2 to V3 migration surface. Never suggest this command implicitly."
disable-model-invocation: true
---

# /llmdoc:upgrade

Use this command only for an explicit legacy-to-V3 migration.

Do not suggest this command proactively. Do not mention its internals outside this file.

CLI commands below run as `npx -y @tokenroll/llmdoc <cmd>`.

## Authorization

An explicit `/llmdoc:upgrade` invocation authorizes this run to:

- rewrite the repository's `llmdoc/` surface into the V3 layout
- create or rewrite `llmdoc/meta.json`
- delete obsolete legacy llmdoc docs and state files when their content has been migrated or intentionally dropped
- write temporary investigation reports under `.llmdoc-tmp/investigations/`

This command should run against a rollback-safe git state.

## Preconditions

- `git status -- llmdoc/` must be clean before the first formal write.
- Rollback means `git checkout -- llmdoc/` plus deleting newly created files, restoring the pre-migration legacy surface; never hand-edit files back.
- Confirm the legacy surface has a recoverable git backup, and keep the migration isolated so it can be reverted as one change.
- Run the CLI migration surface directly; do not hand-simulate the deterministic migration logic in prompt text.
- If validation fails after migration writes and cannot be repaired in-run, roll back the migration write-set before reporting failure.

## Workflow

1. Map the legacy knowledge surface.
   - Use `investigator` to identify the current legacy structure, surviving durable knowledge, and obsolete material.

2. Run the deterministic CLI migration or diagnostic path.
   - Call `upgrade`.
   - Use CLI diagnostics as the primary migration truth for what was transformed, skipped, or rejected.
   - The CLI inventories legacy markers and reports the target V3 shape; it does not move document bodies on its own.

3. Finalize with `recorder`.
   - Rebuild or adjust the knowledge surface around the V3 root singleton plus topic docs when the CLI reports follow-up recorder work.
   - Fold still-valid historical conclusions into active architecture and guide docs.
   - Drop obsolete migration-only material instead of preserving it as dead weight.

4. Validate before reporting success.
   - Run `validate`.
   - Seed the ledger with `init-state` when no `llmdoc/meta.json` survives the migration, then finalize with `commit --all -m "<message>"`.

## State Invariants

- Successful migration initializes V3 baseline state only after validation passes.
- Per-document fingerprint updates happen only for the migrated or replacement docs that survived.
- A successful first V3 migration seeds the initial convergence snapshot with `source: init`; later convergence changes belong only to prune.

## Result Contract

- `success`: CLI migration completed, recorder follow-up succeeded, and validation passed.
- `no_change`: the declared scope was fully verified and no migration write was needed.
- `dry_run`: migration diagnostics or a plan was produced without writing `llmdoc/`; do not advance state.
- `incomplete`: evidence was insufficient, user input is required, or normal update/prune is needed; roll back writes and do not advance state.
- `failed`: migration failed and writes were rolled back.

Always report:

- the legacy surfaces consumed
- the `upgrade` result
- the V3 surfaces created
- the legacy files deleted or intentionally dropped
- the `validate` result
