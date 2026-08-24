---
name: update
description: Explicit V3 sync of existing llmdoc knowledge against the current repository.
argument-hint: '[summary] [--scope <topic|path...>]'
---

# /llmdoc:update

Use this command when repository knowledge has changed and tracked `llmdoc/` must be synchronized.

Load the `llmdoc` skill before broad exploration.

## Authorization

An explicit `/llmdoc:update` invocation authorizes this run to:

- read repository state and existing llmdoc docs
- write impacted `llmdoc/` documents and `llmdoc/meta.json`
- write temporary investigation reports under `.llmdoc-tmp/investigations/`

This command does not authorize source-code edits.

## Preconditions

- `git status -- llmdoc/` must be clean before the first formal write.
- Rollback means `git checkout -- llmdoc/` (plus deleting any newly created files under `llmdoc/`); never hand-edit files back.
- If `npx --no-install llmdoc validate` fails after writes and cannot be repaired in-run, roll back the doc write-set before reporting failure.

## Workflow

1. Measure the current doc state.
   - Run `npx --no-install llmdoc status`.
   - Run `npx --no-install llmdoc delta` with any explicit scope flags.

2. Choose the lightest sufficient path from the delta result.
   - Light: impacted docs are already mapped and facts are straightforward.
   - Deep: unmapped files, boundary changes, conflicting facts, or broad impact.

3. Execute the update.
   - Light: `recorder` updates the impacted docs directly from `delta`, `context`, `search`, and targeted `show` reads.
   - Deep: `investigator` writes a scoped report first, then `recorder` rewrites the affected docs using that report plus the CLI evidence.

4. Re-validate and finalize.
   - Run `npx --no-install llmdoc commit -m "<message>"` (add `--all` for a full-repository verification, `--no-verify` in repos with heavy git hooks). It gates on validate, commits the `llmdoc/` write-set, refreshes fingerprints, and lands the `meta.json` change as a follow-up commit — never hand-roll this sequence or use `--amend` (it rewrites the hash fingerprints just recorded).
   - Re-check `npx --no-install llmdoc status` when you need a final stale/clean signal.

5. Fold durable lessons into stable docs directly.
   - Put reusable cautions, invariants, and workflow fixes into the relevant architecture or guide docs.
   - Do not recreate a separate reflection pipeline.

## State Invariants

- Full successful updates may advance the repository baseline.
- Scoped updates must update only per-document fingerprints, not the global baseline.
- Update never changes convergence state. If growth requires convergence, finish update and ask once before running the separate prune workflow.

## Result Contract

- `success`: docs updated, validated, and state advanced according to scope.
- `no_change`: the declared scope was fully verified and no write was needed.
- `dry_run`: the user asked for a dry run, or only status/delta/investigation/planning output was produced without writing `llmdoc/`; do not advance state.
- `incomplete`: evidence was insufficient, user input is required, or the scope belongs to a different explicit maintenance workflow; roll back writes and do not advance state.
- `failed`: update failed and doc writes were rolled back.

Always report:

- the chosen path (`light` or `deep`) and why
- the `status` and `delta` signals used
- any investigation report path
- the stable docs changed by `recorder`
- the `validate` result
- the `fingerprint` result or why it was skipped
