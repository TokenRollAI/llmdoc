---
description: 'Command: init (imported from Claude Code)'
name: cmd-init
---

# /llmdoc:init

Use this command only when the repository does not already have valid V3 `llmdoc/`.

Load the `llmdoc` skill before broad exploration.

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
- If `npx --no-install llmdoc validate` fails after writes, revert the init write-set before reporting failure.

## Workflow

1. Inventory the repository surface.
   - Read top-level manifests, README files, entrypoints, test surfaces, and release/config files.
   - Use one or more `investigator` subagents for complementary evidence scopes when the repository is large enough to benefit; keep their write ownership in `.llmdoc-tmp/`.
   - Check coverage and resolve conflicting evidence before handing the result to `recorder`.

2. Build the first V3 knowledge surface with `recorder`.
   - Define topic boundaries before drafting leaf docs.
   - Prefer a small number of high-value docs over broad shallow coverage.
   - Keep stable knowledge in `llmdoc/` and validity state in `llmdoc/meta.json`.
   - Create the V3 root singleton plus one-level topic directories with mandatory `topic/index.mdx`.

3. Validate before reporting success.
   - Run `npx --no-install llmdoc validate`.
   - Fix all schema, routing, and reference failures before finishing.
   - On a validation failure that cannot be repaired in-run, roll back the init write-set.

## State Invariants

- Init seeds the baseline only for a successful full bootstrap.
- Per-document fingerprint updates happen only after successful writes and validation.
- A successful bootstrap seeds the initial convergence snapshot with `source: init`; failed, incomplete, and dry-run paths never change it.

## Result Contract

- `success`: V3 surface created, validated, and baseline initialized.
- `no_change`: the declared scope was fully checked and no write was needed, including when valid V3 knowledge already exists.
- `dry_run`: investigation or planning completed without writing `llmdoc/`; do not advance state.
- `incomplete`: evidence was insufficient or legacy migration/user input is required; roll back writes and do not advance state.
- `failed`: bootstrap failed and writes were rolled back.

Always report:

- whether init ran or was refused
- the investigation report path or paths used
- the topics and stable docs created
- the `npx --no-install llmdoc validate` result
- any material gaps left for later `/llmdoc:update`
