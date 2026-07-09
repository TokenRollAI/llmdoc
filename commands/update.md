---
description: "Keep tracked llmdoc docs current with the repository using commit-based change detection and the lightest sufficient update mode."
argument-hint: "[summary] [--range A..B ...] [--commits SHA,SHA ...] [--since REF] [--from SHA] [--working-tree-only] [--include-default]"
---

# /llmdoc:update

Use this command after a task when the tracked project knowledge, workflow guidance, or doc structure should be updated.

The goal is not to archive everything the task discovered. The goal is to keep tracked `llmdoc/` docs consistent with the current repository while staying smaller than the source code or adding architectural explanation the source cannot provide by itself.

Change detection is **commit-based**: it is anchored on a durable watermark (`llmdoc/state/sync.md`) recording the last source commit already reflected in `llmdoc/`, not on the working tree or the date. Uncommitted changes are an additional input; they never move the watermark.

Before executing the workflow, load the `llmdoc` skill.

Why:

- the skill defines what belongs in `must/`, stable docs, and memory
- the skill explains update modes, memory handling, and when reflection is useful
- this command should focus on orchestration, not re-explain the whole system

Invariants, design rationale, and verified git semantics: `llmdoc/architecture/update-orchestration.md`.

## Sync State

`llmdoc/state/sync.md` is a tracked, machine-managed markdown file holding one load-bearing field, `watermark-commit` (full 40-hex SHA). It is not project knowledge: never index it, never add it to `startup.md`/`must/`, never count it as active memory. Read the watermark with a single anchored line:

```sh
W=$(awk -F': ' '/^- watermark-commit:/{print $2}' llmdoc/state/sync.md 2>/dev/null | tr -d '[:space:]')
```

`recorder` is the only writer of `sync.md`, and only advances it as the terminal step of a successful update (see Watermark Advance).

## Change Detection (commit range)

Run all git plumbing without `set -e` (capture each exit code) so a `128` degrades instead of aborting. The resolution ladder order is an invariant — never reorder:

```sh
# 1. Capability probe
[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || { echo "non-git: watermark inactive"; }  # → legacy working-tree detection, no watermark read/advance
SHALLOW=$(git rev-parse --is-shallow-repository)
H=$(git rev-parse HEAD)                                  # capture once

# 2. Read watermark (empty/unknown-schema → first-run: base=HEAD, no backfill unless --from/--since, force ≥ analysis, seed at HEAD)
W=$(awk -F': ' '/^- watermark-commit:/{print $2}' llmdoc/state/sync.md 2>/dev/null | tr -d '[:space:]')

# 3. EXISTENCE before reachability (merge-base --is-ancestor exits 128 fatal on a missing object; guard first)
git rev-parse --verify --quiet "$W^{commit}" >/dev/null || { echo "watermark object missing"; }  # rev-parse --verify --quiet exits 1 cleanly on a missing/non-commit object (cat-file -e "$W^{commit}" would fatal 128 on the peel) → first-run baseline=HEAD, warn, do not advance; if $SHALLOW=true suggest: git fetch --unshallow

# 4. Reachability
git merge-base --is-ancestor "$W" "$H"                   # rc=0 → valid, RANGE_BASE=$W
#   rc≠0 → not ancestor; reverse test:
git merge-base --is-ancestor "$H" "$W"                   # rc=0 → HEAD BEHIND watermark → REFUSE (reverse range would delete docs); do not advance backward; working-tree input only
#   else → true divergence (rebase/squash): RANGE_BASE=$(git merge-base "$W" "$H"); force ≥ analysis

# 5. Net change set (rename-aware, NUL-safe)
git diff --name-status -M -C -z "$RANGE_BASE" "$H"       # R<score> old\tnew → old path cleans stale refs, new path reflects current state
```

Batch flags (if any of `--range/--commits/--since/--from` is given, the default `RANGE_BASE..HEAD` is NOT added unless `--include-default`). Each batch resolves to a set of changed **paths**: parse the `--name-status` records — drop the status column, and for a rename `R` take BOTH the old and new path. Union all batch path-sets with the working-tree set, deduplicated (do not `sort -u` raw NUL/status records):

- `--range A..B` (repeatable): `git diff --name-status -M -C -z A B`.
- `--commits SHA,…`: per commit `git diff --name-status -M -C -z <sha>^ <sha>`; **reject merge commits** (parent count > 1 → tell the user to pass `A..B`); **root commit** diffs against the empty tree `git hash-object -t tree /dev/null` (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`).
- `--since REF|date`: for a ref, `<ref>..HEAD`; for a date, resolve a boundary commit `B=$(git rev-list -1 --before=<date> HEAD)` and diff `B..HEAD` with the same `git diff --name-status -M -C -z` as every other branch (do NOT `git log --name-only`, which yields a statusless, blank-line-polluted shape that will not union cleanly).
- `--from SHA`: one-off start override for this run only; does not touch `sync.md`.
- `--working-tree-only`: skip the committed range entirely; document only uncommitted changes; never advance the watermark.

Always fold in, as an ADDITIONAL input tagged `worktree` (never advances the watermark): `git diff --name-only HEAD` (unstaged) ∪ `git diff --name-only --cached` (staged) ∪ `git ls-files --others --exclude-standard` (untracked).

Empty range (`W == HEAD`, the commonest steady-state run): if `RANGE_BASE..HEAD` is empty AND there are no working-tree changes AND no batch flags, report `already up to date through <Hshort>` and exit without touching docs, the index, or the watermark.

Doc-commit loop-breaker: exclude `llmdoc/` from the "is there source work?" test. If `git diff --name-only "$RANGE_BASE".."$H" -- ':(exclude)llmdoc/**'` is empty (range non-empty but doc-only), fast-forward the watermark to HEAD with zero doc work. Always exclude the sync file and `.llmdoc-tmp/` from every diff so a run never self-triggers.

Content selection: `recorder` reads committed-batch file content at the BATCH TIP (`git show <tip>:<path>`), never from HEAD/disk, except for the uncommitted working-tree set (read from disk, which wins for any currently-dirty path).

## Mode Selection

Choose the lightest mode that can keep the docs correct. The trigger is range size × authorship × risk (not context freshness).

- `fast`: small range (≤ ~3 commits), self-authored, impacted docs nameable. `--working-tree-only` defaults here. Skip mandatory investigation; update stable docs from the task summary, diff, targeted checks, and any still-valid scratch reports.
- `analysis`: ~4–15 commits, OR any non-self-authored commit, OR multiple clusters, OR a recovered/derived/first-run baseline. Use one focused `investigator` pass with `sink=file`, then `recorder`.
- `full`: > ~15 commits, multi-batch backfill, history-rewrite recovery, disputed facts, or reflection-heavy failures. Use investigator, reflector, and recorder as separate roles.

Hard floors (always force ≥ `analysis`): a merge-base-recovered baseline, a derived/first-run baseline, or any non-self-authored commit. Backfill blast-radius cap: a first-run/`--since` range beyond ~20 commits or ~50 files forces `full` and explicit user confirmation. Thresholds are tunable defaults; report the chosen mode and the signals that triggered it.

## `.llmdoc-tmp/`

`.llmdoc-tmp/` is a local temporary context cache, not stable project memory.

- Investigator reports may be retained across sessions under `.llmdoc-tmp/investigations/`.
- They are ignored by git, not indexed by `llmdoc/index.md`, and may be deleted at any time.
- Reuse them only after checking their recorded git revision, resolved range, scope, and unresolved gaps against the current repository.
- Promote only durable conclusions into tracked `llmdoc/` docs.

## Actions

1. Rebuild task context.
   - Read `llmdoc/index.md`, `llmdoc/startup.md`, and the MUST docs it lists.
   - Proactively read relevant `llmdoc/guides/` and `llmdoc/memory/reflections/` before planning edits.
   - Note any explicit change summary from `$ARGUMENTS`.

2. Resolve sync state and compute the change set.
   - Run the resolution ladder above; parse batch flags; union batch impact sets with the working-tree set; apply the loop-breaker.
   - Handle degraded cases (non-git, shallow-below-boundary, first-run, orphaned, diverged, HEAD-behind) per the ladder; never fabricate a watermark advance on a degraded run.

3. Select the update mode from range size × authorship × risk. Honor the hard floors and the backfill cap.

4. Investigate only when the selected mode needs it.
   - Seed the investigator with the resolved net-diff path list. Persist one scratch report under `.llmdoc-tmp/investigations/` recording the resolved `RANGE_BASE..H` range.
   - Prefer targeted questions over broad repo scans.

5. Reflect only when reflection has value.
   - Write a reflection into `llmdoc/memory/reflections/` only when the task exposed a workflow failure, repeated mistake, missing signal, or durable process lesson.
   - Do not force a reflection for routine `fast` updates.

6. Update stable llmdoc with `recorder`.
   - Update only the impacted docs, against the batch-tip state.
   - Remove or correct stable-doc claims that no longer match the current code.
   - Split documents aggressively instead of appending to a large file.
   - Reconcile `llmdoc/memory/doc-gaps.md`: close resolved gaps, mark stale gaps, add only actionable new gaps with closure criteria.

7. Run the active-memory archive check.
   - After any new reflection is written, count active memory files under `llmdoc/memory/`, excluding `lessons-learned.md`, `doc-gaps.md`, and anything under `archive/` (`llmdoc/state/` is outside `memory/` and is not counted).
   - If the count is greater than 5, follow `skills/llmdoc/references/lessons-learned.md`.

8. Synchronize `llmdoc/index.md`.
   - Ensure new and changed docs are discoverable.
   - Do not index `.llmdoc-tmp/`, and do not index `llmdoc/state/sync.md` as knowledge.

9. Advance the watermark (recorder-owned terminal step).
   - Only on a complete, successful update that consumed a committed range.
   - Advance `watermark-commit` to the captured `H` (default) or the highest unbroken-prefix tip (partial/batch); rewrite only `watermark-commit`, `watermark-subject`, and `updated-at/by`.
   - NEVER advance on a `--working-tree-only` run, a failed/partial run, a HEAD-behind-watermark run, or while a git operation is in progress or HEAD is detached.

10. Report the mode used, resolved range(s)/batches and commit count, old → new watermark (or why it did not move), any scratch report or reflection path, the archive action taken or skipped, and the stable docs that changed.
