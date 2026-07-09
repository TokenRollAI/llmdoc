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

`llmdoc/state/sync.md` is a tracked, machine-managed markdown file holding one load-bearing field, `watermark-commit` (the full commit SHA, whatever hash the repo uses — SHA-1 or SHA-256). It is not project knowledge: never index it, never add it to `startup.md`/`must/`, never count it as active memory. Read the watermark with a single anchored line:

```sh
W=$(awk -F': ' '/^- watermark-commit:/{print $2}' llmdoc/state/sync.md 2>/dev/null | tr -d '[:space:]')
```

`recorder` is the only writer of `sync.md`, and only advances it as the terminal step of a successful update.

## Change Detection (commit range)

Run all git plumbing without `set -e` (capture each exit code) so a `128` degrades instead of aborting. The resolution ladder order is an invariant — never reorder:

```sh
# 1. Capability probe (gates the whole ladder — steps 2-5 assume a git work tree)
[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || {
  echo "non-git: watermark inactive"   # STOP HERE: use legacy working-tree + staged + summary detection;
  return 0 2>/dev/null || exit 0        # do NOT run steps 2-5, do NOT read or advance the watermark
}
SHALLOW=$(git rev-parse --is-shallow-repository)
H=$(git rev-parse HEAD)                                  # capture once

# 2. Read watermark
W=$(awk -F': ' '/^- watermark-commit:/{print $2}' llmdoc/state/sync.md 2>/dev/null | tr -d '[:space:]')

# 3-4. Resolve RANGE_BASE with EXPLICIT branching. Existence gates reachability: never run merge-base
#      on an empty/missing $W — it would fatal-128, not skip. Each branch is terminal.
if [ -z "$W" ]; then
  echo "watermark empty/missing → first-run: base=HEAD (no backfill unless --from/--since), force ≥ analysis, seed at HEAD on success"
  RANGE_BASE=$H
elif ! git rev-parse --verify --quiet "$W^{commit}" >/dev/null; then
  echo "watermark object missing (GC'd / below shallow boundary) → first-run baseline=HEAD, warn, do NOT advance"
  # if $SHALLOW = true, suggest: git fetch --unshallow. (rev-parse --verify --quiet exits 1 cleanly; cat-file -e "$W^{commit}" would fatal 128 on the peel.)
  RANGE_BASE=$H
elif git merge-base --is-ancestor "$W" "$H"; then
  RANGE_BASE=$W                                          # watermark valid
elif git merge-base --is-ancestor "$H" "$W"; then
  echo "HEAD BEHIND watermark → REFUSE (reverse W..HEAD would list future files as deletions and strip docs); working-tree input only, do NOT advance"
  RANGE_BASE=$H
else
  RANGE_BASE=$(git merge-base "$W" "$H")                 # true divergence (rebase/squash-merge); force ≥ analysis
fi

# 5. Net change set (rename-aware, NUL-safe). In -z mode a rename/copy record is STATUS\0OLD\0NEW\0
#    (3 fields; STATUS is R<score>/C<score>); a normal record is STATUS\0PATH\0.
git diff --name-status -M -C -z "$RANGE_BASE" "$H"
```

Batch flags (if any of `--range/--commits/--since/--from` is given, the default `RANGE_BASE..HEAD` is NOT added unless `--include-default`). Each batch resolves to a set of changed **paths**: parse the `--name-status -z` records — drop the status column; in `-z` mode a record is `STATUS\0PATH\0`, but a rename/copy record (status `R<score>`/`C<score>`) is `STATUS\0OLD\0NEW\0`, so read TWO path tokens when the status starts with `R` or `C` (take both) and one otherwise, or the parser desyncs. Union all batch path-sets with the working-tree set, deduplicated (do not `sort -u` raw NUL/status records):

- `--range A..B` (repeatable): `git diff --name-status -M -C -z A B`.
- `--commits SHA,…`: per commit `git diff --name-status -M -C -z <sha>^ <sha>`; **reject merge commits** (parent count > 1 → ask the user to pass `A..B`); **root commit** diffs against the empty tree `git hash-object -t tree /dev/null` (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`).
- `--since REF|date`: for a ref, `<ref>..HEAD`; for a date, resolve a boundary commit `B=$(git rev-list -1 --before=<date> HEAD)` and diff `B..HEAD` with the same `git diff --name-status -M -C -z` as every other branch. If `B` is empty (no commit predates `<date>`, so the whole history is in range), diff against the empty tree `git hash-object -t tree /dev/null` instead of `B..HEAD` (which would be `..HEAD` and fatal). Do NOT `git log --name-only`, which yields a statusless, blank-line-polluted shape that will not union cleanly.
- `--from SHA`: one-off start override for this run only; does not touch `sync.md`.
- `--working-tree-only`: skip the committed range entirely; document only uncommitted changes; never advance the watermark.

Always fold in, as an ADDITIONAL input tagged `worktree` (never advances the watermark): `git diff --name-only HEAD` (every tracked path whose on-disk content differs from HEAD — staged and unstaged) ∪ `git ls-files --others --exclude-standard` (untracked). `git diff --name-only HEAD` already covers staged changes, so a separate `--cached` diff is redundant.

Empty range (already synced) — applies ONLY when the watermark was VALID (the `RANGE_BASE=$W` branch) and `W == HEAD`: if there are also no working-tree changes and no batch flags, report `already up to date through <Hshort>` and exit without touching docs, the index, or the watermark. The degraded branches that force `RANGE_BASE=HEAD` (empty/missing watermark → first-run seed; HEAD-behind → refuse) also produce an empty range but are NOT "already synced" — each is handled by its own branch outcome above, not by this terminal.

Doc-commit loop-breaker: if `git diff --name-only "$RANGE_BASE".."$H" -- ':(exclude)llmdoc/**'` is empty (range non-empty but doc-only), fast-forward the watermark to HEAD with zero doc work. Always exclude the sync file and `.llmdoc-tmp/` from every diff.

Content selection: `recorder` reads committed-batch file content at the BATCH TIP (`git show <tip>:<path>`), never from HEAD/disk, except for the uncommitted working-tree set (read from disk, which wins for any currently-dirty path).

## Mode Selection

The trigger is range size × authorship × risk (not context freshness):

- `fast`: small range (≤ ~3 commits), self-authored, impacted docs nameable. `--working-tree-only` defaults here. Use the task summary, diff, targeted checks, and any still-valid scratch reports.
- `analysis`: ~4–15 commits, OR any non-self-authored commit, OR multiple clusters, OR a recovered/derived/first-run baseline. One focused evidence pass persisted under `.llmdoc-tmp/investigations/`.
- `full`: > ~15 commits, multi-batch backfill, history-rewrite recovery, disputed facts, or reflection-heavy failures — separate investigation, reflection, and recording roles.

Hard floors (force ≥ `analysis`): a merge-base-recovered baseline, a derived/first-run baseline, or any non-self-authored commit. Backfill blast-radius cap: a first-run/`--since` range beyond ~20 commits or ~50 files forces `full` and explicit user confirmation.

Self-authored test: a commit is self-authored when its author email (`git log -1 --format=%ae <sha>`) equals the current `git config user.email`. If the identity cannot be determined (e.g., a subagent with no git identity, or `user.email` unset), treat commits as non-self-authored — the conservative side that forces ≥ `analysis`.

## Workflow

1. Rebuild task context (index, startup, MUST docs, relevant guides + reflections; note any `$ARGUMENTS` summary).
2. Resolve sync state and compute the change set (run the ladder; parse batch flags; union with the working-tree set; apply the loop-breaker; handle degraded cases — non-git, shallow, first-run, orphaned, diverged, HEAD-behind — without fabricating a watermark advance).
3. Select the mode from range size × authorship × risk; honor the hard floors and backfill cap.
4. Investigate only as needed, seeded with the resolved net-diff path list; scratch reports record the resolved `RANGE_BASE..H` range.
5. Reflect only when there is a workflow failure, repeated mistake, missing signal, or durable process lesson. Do not force a reflection for routine `fast` updates.
6. Update stable llmdoc docs against the batch-tip state: update only impacted docs, correct stale claims, split aggressively, reconcile `llmdoc/memory/doc-gaps.md`.
7. Run the active-memory archive check (count files under `llmdoc/memory/` excluding `lessons-learned.md`, `doc-gaps.md`, `archive/`; `llmdoc/state/` is not counted). If > 5, follow `skills/llmdoc/references/lessons-learned.md`.
8. Synchronize `llmdoc/index.md`. Do not index `.llmdoc-tmp/`, and do not index `llmdoc/state/sync.md` as knowledge.
9. Advance the watermark (recorder-owned terminal step). Safe-to-advance gate — ALL must hold: the update completed successfully and consumed a committed range; HEAD is attached (`git symbolic-ref -q HEAD` succeeds); and no git operation is in progress — test by whether the resolved path EXISTS on disk (`git rev-parse --git-path` always prints a path and exits 0 regardless of existence, so check with `[ -f ]`/`[ -d ]`), none of `[ -f "$(git rev-parse --git-path MERGE_HEAD)" ]`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `[ -d "$(git rev-parse --git-path rebase-merge)" ]`, `rebase-apply` may exist. If the gate holds, advance `watermark-commit` to the captured `H` (or the highest unbroken-prefix tip). Rewrite ONLY these fields, keeping the exact `- watermark-commit: ` line prefix (the reader anchors on it — do not reformat): `watermark-commit` (new full commit SHA), `watermark-subject` (`git log -1 --format=%s <new-sha>`), `updated-at` (ISO-8601 UTC, `date -u +%Y-%m-%dT%H:%M:%SZ`), `updated-by` (`/llmdoc:update`). NEVER advance on a `--working-tree-only` run, a failed/partial run, a HEAD-behind-watermark run, or when the safe-to-advance gate fails.
10. Report the mode used, resolved range(s)/batches and commit count, old → new watermark (or why it did not move), scratch/reflection paths, the archive action, and the stable docs that changed.

At the end of a non-trivial task, proactively consider whether the user should be prompted to run this workflow.
