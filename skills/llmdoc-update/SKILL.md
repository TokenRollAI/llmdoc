---
name: llmdoc-update
description: "Codex-native entry skill for keeping tracked llmdoc docs current with the repository using commit-based change detection. Use this when you want the /llmdoc:update workflow in Codex."
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# llmdoc-update

This skill is the Codex-native equivalent of `/llmdoc:update`.

The update target is tracked `llmdoc/`, not `.llmdoc-tmp/`. Stable docs should stay consistent with the current repository and remain smaller than the source code or provide architectural explanation that source search does not.

Change detection is **commit-based**: it is anchored on a durable watermark (`llmdoc/state/sync.md`) recording the last source commit already reflected in `llmdoc/`, not on the working tree or the date. Uncommitted changes are an additional input; they never move the watermark.

Use it when:

- a task changed project knowledge, architecture understanding, or workflow guidance
- a useful mistake or missing-doc lesson should be preserved
- you want a command-like Codex entrypoint for updating llmdoc

Read the batch flags from `$ARGUMENTS` / the user message:
`[summary] [--range A..B ...] [--commits SHA,SHA ...] [--since REF] [--from SHA] [--working-tree-only] [--include-default]`

Invariants, design rationale, and verified git semantics: `llmdoc/architecture/update-orchestration.md`.

Before editing stable docs:

- read `llmdoc/index.md`, `llmdoc/startup.md` and the MUST docs it lists
- proactively read relevant `llmdoc/guides/` and `llmdoc/memory/reflections/`
- read `skills/llmdoc/references/lessons-learned.md` for the active-memory archive threshold
- check relevant `.llmdoc-tmp/investigations/` reports only as local temporary evidence (validate their git revision, resolved range, scope, gaps)
- align with the user before non-trivial edits

## Sync State

`llmdoc/state/sync.md` is a tracked, machine-managed markdown file holding one load-bearing field, `watermark-commit` (full 40-hex SHA). It is not project knowledge: never index it, never add it to `startup.md`/`must/`, never count it as active memory. Read the watermark with a single anchored line:

```sh
W=$(awk -F': ' '/^- watermark-commit:/{print $2}' llmdoc/state/sync.md 2>/dev/null | tr -d '[:space:]')
```

`recorder` is the only writer of `sync.md`, and only advances it as the terminal step of a successful update.

## Change Detection (commit range)

Run all git plumbing without `set -e` (capture each exit code) so a `128` degrades instead of aborting. The resolution ladder order is an invariant — never reorder:

```sh
# 1. Capability probe
[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || echo "non-git: watermark inactive"  # → legacy working-tree detection, no watermark read/advance
SHALLOW=$(git rev-parse --is-shallow-repository)
H=$(git rev-parse HEAD)                                  # capture once

# 2. Read watermark (empty/unknown-schema → first-run: base=HEAD, no backfill unless --from/--since, force ≥ analysis, seed at HEAD)
W=$(awk -F': ' '/^- watermark-commit:/{print $2}' llmdoc/state/sync.md 2>/dev/null | tr -d '[:space:]')

# 3. EXISTENCE before reachability (merge-base --is-ancestor exits 128 fatal on a missing object; guard first)
git rev-parse --verify --quiet "$W^{commit}" >/dev/null || echo "watermark object missing"  # rev-parse --verify --quiet exits 1 cleanly on a missing/non-commit object (cat-file -e "$W^{commit}" would fatal 128 on the peel) → first-run baseline=HEAD, warn, do not advance; if $SHALLOW=true suggest: git fetch --unshallow

# 4. Reachability
git merge-base --is-ancestor "$W" "$H"                   # rc=0 → valid, RANGE_BASE=$W
#   rc≠0 → not ancestor; reverse test:
git merge-base --is-ancestor "$H" "$W"                   # rc=0 → HEAD BEHIND watermark → REFUSE (reverse range would delete docs); working-tree input only
#   else → true divergence (rebase/squash): RANGE_BASE=$(git merge-base "$W" "$H"); force ≥ analysis

# 5. Net change set (rename-aware, NUL-safe)
git diff --name-status -M -C -z "$RANGE_BASE" "$H"
```

Batch flags (if any of `--range/--commits/--since/--from` is given, the default `RANGE_BASE..HEAD` is NOT added unless `--include-default`). Each batch resolves to a set of changed **paths**: parse the `--name-status` records — drop the status column, and for a rename `R` take BOTH the old and new path. Union all batch path-sets with the working-tree set, deduplicated (do not `sort -u` raw NUL/status records):

- `--range A..B` (repeatable): `git diff --name-status -M -C -z A B`.
- `--commits SHA,…`: per commit `git diff --name-status -M -C -z <sha>^ <sha>`; **reject merge commits** (parent count > 1 → ask the user to pass `A..B`); **root commit** diffs against the empty tree `git hash-object -t tree /dev/null` (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`).
- `--since REF|date`: for a ref, `<ref>..HEAD`; for a date, resolve a boundary commit `B=$(git rev-list -1 --before=<date> HEAD)` and diff `B..HEAD` with the same `git diff --name-status -M -C -z` as every other branch (do NOT `git log --name-only`, which yields a statusless, blank-line-polluted shape that will not union cleanly).
- `--from SHA`: one-off start override for this run only; does not touch `sync.md`.
- `--working-tree-only`: skip the committed range entirely; document only uncommitted changes; never advance the watermark.

Always fold in, as an ADDITIONAL input tagged `worktree` (never advances the watermark): `git diff --name-only HEAD` ∪ `git diff --name-only --cached` ∪ `git ls-files --others --exclude-standard`.

Empty range (`W == HEAD`, the commonest steady-state run): if `RANGE_BASE..HEAD` is empty AND there are no working-tree changes AND no batch flags, report `already up to date through <Hshort>` and exit without touching docs, the index, or the watermark.

Doc-commit loop-breaker: if `git diff --name-only "$RANGE_BASE".."$H" -- ':(exclude)llmdoc/**'` is empty (range non-empty but doc-only), fast-forward the watermark to HEAD with zero doc work. Always exclude the sync file and `.llmdoc-tmp/` from every diff.

Content selection: `recorder` reads committed-batch file content at the BATCH TIP (`git show <tip>:<path>`), never from HEAD/disk, except for the uncommitted working-tree set (read from disk, which wins for any currently-dirty path).

## Mode Selection

The trigger is range size × authorship × risk (not context freshness):

- `fast`: small range (≤ ~3 commits), self-authored, impacted docs nameable. `--working-tree-only` defaults here. Use the task summary, diff, targeted checks, and any still-valid scratch reports.
- `analysis`: ~4–15 commits, OR any non-self-authored commit, OR multiple clusters, OR a recovered/derived/first-run baseline. One focused evidence pass persisted under `.llmdoc-tmp/investigations/`.
- `full`: > ~15 commits, multi-batch backfill, history-rewrite recovery, disputed facts, or reflection-heavy failures — separate investigation, reflection, and recording roles.

Hard floors (force ≥ `analysis`): a merge-base-recovered baseline, a derived/first-run baseline, or any non-self-authored commit. Backfill blast-radius cap: a first-run/`--since` range beyond ~20 commits or ~50 files forces `full` and explicit user confirmation.

## Workflow

1. Rebuild task context (index, startup, MUST docs, relevant guides + reflections; note any `$ARGUMENTS` summary).
2. Resolve sync state and compute the change set (run the ladder; parse batch flags; union with the working-tree set; apply the loop-breaker; handle degraded cases — non-git, shallow, first-run, orphaned, diverged, HEAD-behind — without fabricating a watermark advance).
3. Select the mode from range size × authorship × risk; honor the hard floors and backfill cap.
4. Investigate only as needed, seeded with the resolved net-diff path list; scratch reports record the resolved `RANGE_BASE..H` range.
5. Reflect only when there is a workflow failure, repeated mistake, missing signal, or durable process lesson. Do not force a reflection for routine `fast` updates.
6. Update stable llmdoc docs against the batch-tip state: update only impacted docs, correct stale claims, split aggressively, reconcile `llmdoc/memory/doc-gaps.md`.
7. Run the active-memory archive check (count files under `llmdoc/memory/` excluding `lessons-learned.md`, `doc-gaps.md`, `archive/`; `llmdoc/state/` is not counted). If > 5, follow `skills/llmdoc/references/lessons-learned.md`.
8. Synchronize `llmdoc/index.md`. Do not index `.llmdoc-tmp/`, and do not index `llmdoc/state/sync.md` as knowledge.
9. Advance the watermark (recorder-owned terminal step): only on a complete, successful update that consumed a committed range; rewrite only `watermark-commit`, `watermark-subject`, `updated-at/by`. NEVER advance on a `--working-tree-only` run, a failed/partial run, a HEAD-behind-watermark run, or while a git operation is in progress or HEAD is detached.
10. Report the mode used, resolved range(s)/batches and commit count, old → new watermark (or why it did not move), scratch/reflection paths, the archive action, and the stable docs that changed.

At the end of a non-trivial task, proactively consider whether the user should be prompted to run this workflow.
