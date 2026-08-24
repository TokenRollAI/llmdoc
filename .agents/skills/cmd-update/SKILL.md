---
description: 'Command: update (imported from Claude Code)'
argument-hint: '[summary] [--scope <topic|path...>]'
name: cmd-update
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
- If `npx llmdoc validate` fails after writes and cannot be repaired in-run, roll back the doc write-set before reporting failure.

## Workflow

1. Measure the current doc state.
   - Run `npx llmdoc status`.
   - Run `npx llmdoc delta` with any explicit scope flags.

2. Choose the lightest sufficient path from the delta result.
   - Light: impacted docs are already mapped and facts are straightforward.
   - Deep: unmapped files, boundary changes, conflicting facts, or broad impact.

3. Execute the update.
   - Light: `recorder` updates the impacted docs directly from `delta`, `context`, `search`, and targeted `show` reads.
   - Deep: `investigator` writes a scoped report first, then `recorder` rewrites the affected docs using that report plus the CLI evidence.

4. Re-validate and finalize.
   - Run `npx llmdoc validate`.
   - After either `success` or a fully verified `no_change`, run `npx llmdoc fingerprint --update <paths...>` for scoped work or `npx llmdoc fingerprint --all` for a full-repository verification.
   - Re-check `npx llmdoc status` when you need a final stale/clean signal.

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
- `dry_run`: status, delta, investigation, or a plan was produced without writing `llmdoc/`; do not advance state.
- `incomplete`: evidence was insufficient, user input is required, or the scope belongs to a different explicit maintenance workflow; roll back writes and do not advance state.
- `failed`: update failed and doc writes were rolled back.

Always report:

- the chosen path (`light` or `deep`) and why
- the `status` and `delta` signals used
- any investigation report path
- the stable docs changed by `recorder`
- the `validate` result
- the `fingerprint` result or why it was skipped
