# Update And Memory

## Update protocol

When project knowledge changes, use `/llmdoc:update`.

Tracked `llmdoc/` docs should describe the current repository. They should be smaller than the source code they describe, or add architectural intent, boundaries, and implementation reasoning that raw source search does not provide quickly.

## Update modes

Choose the lightest mode that keeps the docs correct:

- `fast`: default after the coordinating assistant has just implemented the change. Use the fresh task summary, diff, targeted checks, and any still-valid local scratch reports.
- `analysis`: use one focused evidence pass when current-state research, stale context, or unclear impact makes the update uncertain.
- `full`: use separate investigation, reflection, and stable-doc maintenance when high risk, disputed facts, or process learning justify the extra independence.

Escalate from `fast` only when the assistant cannot confidently name the impacted docs and facts.

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

Use `decisions/` for durable design or process decisions.
Use `memory/doc-gaps.md` to track missing or weak documentation that should be improved later.

During every non-trivial update, reconcile `memory/doc-gaps.md`: close gaps that the update resolved, mark stale gaps when the underlying concern no longer applies, and add only actionable new gaps with a clear closure condition.
