# Update And Memory

## Update protocol

When project knowledge changes, use `/llmdoc:update`.

Tracked `llmdoc/` docs should describe the current repository. They should be smaller than the source code they describe, or add architectural intent, boundaries, and implementation reasoning that raw source search does not provide quickly.

## Commit watermark

Change detection is commit-based, anchored on a durable, git-tracked watermark: `llmdoc/state/sync.md`, whose one load-bearing field `watermark-commit` is the last source commit already reflected in `llmdoc/`.

- Default change set = the NET diff `watermark..HEAD` (`git diff --name-status -M -C -z`): the current state of every path touched since the watermark.
- Multiple batches can be consumed in one run (`--range` repeatable, `--commits`, `--since`, `--from`, `--working-tree-only`); all impact sets are unioned and processed in a single pass.
- Uncommitted working-tree/staged/untracked changes are always an ADDITIONAL input, but they never advance the watermark.
- `recorder` advances the watermark only as the terminal step of a complete, successful update that consumed a committed range.
- `llmdoc/state/sync.md` is machine-managed state, not project knowledge: never index it, never put it in `startup.md`/`must/`, never count it as active memory.

The resolution ladder, batch flags, degraded-mode handling, and exact git commands are the contract in `commands/update.md` and `skills/llmdoc-update/SKILL.md`. Invariants, design rationale, and verified git semantics: `llmdoc/architecture/update-orchestration.md`.

### Net diff vs per-commit

- `recorder` documents CURRENT state, read at the batch tip (`git show <tip>:<path>`, never HEAD/disk except for the uncommitted working-tree set). The net diff decides which docs change and what they now say. Never document an intermediate state absent at the tip.
- `reflector`/`investigator` may consult per-commit history (`git log`, `git show`, `--first-parent`) only to explain WHY a change happened, and only when a reflection is being written. Per-commit history never decides which docs change.

## Update modes

Choose the lightest mode that keeps the docs correct. The trigger is range size × authorship × risk, not context freshness:

- `fast`: small range (≤ ~3 commits), self-authored, impacted docs nameable. Use the task summary, diff, targeted checks, and any still-valid local scratch reports.
- `analysis`: ~4–15 commits, OR any non-self-authored commit, OR multiple clusters, OR a recovered/derived/first-run baseline. One focused evidence pass.
- `full`: > ~15 commits, multi-batch backfill, history-rewrite recovery, disputed facts, or process learning — separate investigation, reflection, and stable-doc maintenance.

Hard floors force ≥ `analysis`: a merge-base-recovered baseline, a derived/first-run baseline, or any non-self-authored commit. A first-run/`--since` range beyond ~20 commits or ~50 files forces `full` and explicit user confirmation. Freshness of the assistant's context is an input to mode selection, not the source of change detection.

The update order is:

1. rebuild task context
2. choose update mode
3. investigate only when the mode requires it
4. write reflection only when there is a workflow lesson or missing-doc signal
5. update stable docs and reconcile `memory/doc-gaps.md`
6. sync `llmdoc/index.md`

Why reflection comes first:

- the process failure is freshest immediately after the task
- missing-doc signals are easier to capture before they are rationalized away
- stable docs should absorb only durable lessons, not raw frustration

This does not mean every update needs a reflection. Routine `fast` updates can skip reflection when there was no process failure, repeated mistake, missing signal, or durable lesson.

## Temporary investigation cache

Investigation scratch belongs under `.llmdoc-tmp/investigations/`.

These files are local temporary context cache:

- they may survive across sessions
- they are ignored by git and may be deleted
- they are not indexed by `llmdoc/index.md`
- they are evidence to validate, not project truth

Each reusable scratch report should record enough context to decide whether it is still valid:

- goal and concrete questions
- date and git revision when available
- evidence scope
- conclusions
- unresolved gaps
- promotion candidates for tracked docs

If the current repository no longer matches the scratch report's revision, scope, or assumptions, ignore it or redo the investigation.

## End-of-task update prompt

At the end of a non-trivial task, the main assistant should actively evaluate whether the user should be prompted to run `/llmdoc:update`.

Prompt the user when any of these are true:

- project structure, architecture, or ownership boundaries changed
- a workflow, convention, or invariant became clearer
- a reflection-worthy mistake, failure, or correction happened
- new knowledge was discovered that future tasks should reuse
- a guide, reference, startup doc, or doc-gap record is stale or missing

Recommended behavior:

1. Briefly name the knowledge that changed.
2. Explain why it is worth persisting.
3. Ask whether to run `/llmdoc:update` now.

## Reflection protocol

Reflections are not optional background notes. Treat relevant reflections as a quality input.

Read relevant reflections:

- before editing a subsystem that has prior reflections
- before repeating a workflow that previously failed
- before updating docs after a difficult or ambiguous task
- after user corrections, failed tests, or major rework

## Memory ownership

- `reflector` writes `llmdoc/memory/reflections/`
- `recorder` maintains `llmdoc/memory/decisions/`
- `recorder` maintains `llmdoc/memory/doc-gaps.md`
- `recorder` is the sole writer of `llmdoc/state/sync.md` (the commit watermark), advancing it only as the terminal step of a successful update; it is machine-managed state, not memory or knowledge

Use `decisions/` for durable design or process decisions.
Use `memory/doc-gaps.md` to track missing or weak documentation that should be improved later.

During every non-trivial update, reconcile `memory/doc-gaps.md`: close gaps that the update resolved, mark stale gaps when the underlying concern no longer applies, and add only actionable new gaps with a clear closure condition.
