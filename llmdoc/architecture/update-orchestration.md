# Update Orchestration

## Purpose
- Define how `/llmdoc:update` keeps tracked `llmdoc/` docs aligned with the current repository without forcing unnecessary multi-agent work.
- Preserve independent investigation when it is useful, while making immediate post-implementation updates fast.

## Knowledge Layers
- `llmdoc/`: tracked project knowledge. It should describe current architecture, implementation intent, boundaries, stable contracts, and recurring workflow rules.
- `llmdoc/state/sync.md`: tracked, machine-managed commit watermark. It is not project knowledge — never index it, never add it to `startup.md`/`must/`, never count it as active memory.
- `.llmdoc-tmp/`: local temporary context cache. It may hold investigator reports or hook logs, but it is ignored by git, not indexed, and may be deleted.
- Source code and git state: the final authority for volatile facts, counts, and implementation details.

## Commit-Based Change Detection
- Change detection is anchored on a durable, git-tracked watermark (`llmdoc/state/sync.md`, field `watermark-commit`) recording the last source commit already reflected in `llmdoc/` — not on the working tree or the date.
- The default change set is the NET diff `watermark..HEAD` (`git diff --name-status -M -C -z`): the current state of every path touched since the watermark.
- Uncommitted working-tree, staged, and untracked changes are always an ADDITIONAL input; they never move the watermark.
- Batch flags let one run consume multiple ranges: `--range A..B` (repeatable), `--commits`, `--since`, `--from`, `--working-tree-only`, `--include-default`. All resolved impact sets are unioned and processed in a single pass.
- The exact resolution ladder (capability probe → watermark read → existence check → reachability → net diff), batch-flag parsing, the doc-only loop-breaker, and degraded-mode handling (non-git, shallow, first-run, orphaned watermark, divergence, HEAD-behind) are the contract in `commands/update.md` and `skills/llmdoc-update/SKILL.md`. This doc holds the invariants; the command docs hold the verified git semantics.
- `recorder` reads committed-batch content at the BATCH TIP (`git show <tip>:<path>`), never from HEAD or disk, except the uncommitted working-tree set (read from disk, which wins for any dirty path). Never document an intermediate state absent at the tip.

## Update Modes
- The mode trigger is range size × authorship × risk, not context freshness.
- `fast`: small range (≤ ~3 commits), self-authored, impacted docs nameable. `--working-tree-only` defaults here. Use the task summary, diff, targeted checks, and any still-valid scratch reports.
- `analysis`: ~4–15 commits, OR any non-self-authored commit, OR multiple clusters, OR a recovered/derived/first-run baseline. Run one focused investigation and persist the scratch report under `.llmdoc-tmp/investigations/`.
- `full`: > ~15 commits, multi-batch backfill, history-rewrite recovery, disputed facts, or process learning — separate investigator, reflector, and recorder roles.
- Hard floors force ≥ `analysis`: a merge-base-recovered baseline, a derived/first-run baseline, or any non-self-authored commit. A first-run/`--since` range beyond ~20 commits or ~50 files forces `full` and explicit user confirmation.

## Invariants
- Stable docs must not describe behavior that no longer exists in the current repository.
- Stable docs should be smaller than the source they describe or add architectural explanation that source search does not provide quickly.
- Investigator reports are reusable evidence, not stable memory or source of truth. A file report is reusable only when the current resolved range is a subset of the report's recorded range.
- Reflections are written only when there is a workflow failure, repeated mistake, missing signal, or durable process lesson.
- `recorder` reconciles `llmdoc/memory/doc-gaps.md` during non-trivial updates.
- `recorder` is the sole writer of `llmdoc/state/sync.md` and `llmdoc/index.md` for a run. It advances `watermark-commit` only as the terminal step of a complete, successful update that consumed a committed range, rewriting only `watermark-commit`, `watermark-subject`, and `updated-at/by`.
- Never advance the watermark on a `--working-tree-only` run, a failed/partial run, a HEAD-behind-watermark run, or while a git operation is in progress or HEAD is detached.
- `worker` never edits `llmdoc/index.md` or `llmdoc/state/sync.md`.
- `llmdoc/index.md` never indexes `.llmdoc-tmp/`, and never indexes `llmdoc/state/sync.md` as knowledge.

## Routing
- Use `must/` for short recurring rules that prevent common mistakes.
- Use `architecture/` for flows, ownership boundaries, invariants, and design intent.
- Use `reference/` for stable lookup facts and contracts.
- Use `guides/` for repeatable workflows.
- Leave raw evidence, volatile observations, and current-state scratch notes in `.llmdoc-tmp/`.
