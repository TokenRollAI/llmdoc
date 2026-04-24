# Update And Memory

## Update protocol

When project knowledge changes, use `/llmdoc:update`.

The update order is:

1. rebuild task context
2. investigate impacted concepts
3. write reflection
4. update stable docs
5. sync `llmdoc/index.md`

Why reflection comes first:

- the process failure is freshest immediately after the task
- missing-doc signals are easier to capture before they are rationalized away
- stable docs should absorb only durable lessons, not raw frustration

Reflections are process memory, not the final long-term rule surface.

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

When recurring lessons have already been promoted into stable docs, prefer those stable docs first and re-open raw reflections only when the original task context still matters.

## Reflection consolidation

`llmdoc/memory/reflections/` should not grow into a second documentation system.

When the directory grows beyond 5 reflection files, the next `/llmdoc:update` should run a consolidation pass:

- group reflections by recurring lesson, not by date or filename
- extract reusable rules, constraints, and reminders instead of retelling each task
- write the stable version in plain language
- use a short example only when it makes the lesson easier to apply
- update an existing stable doc when it already has the right home
- avoid creating a catch-all "reflection summary" file
- do not copy or lightly paraphrase reflection text into stable docs

Default destinations:

- `must/`: short cross-task rules that should matter on nearly every run
- `reference/`: reusable constraints, checklists, thresholds, lookup facts, and worked examples

Examples:

- If several reflections all point to "align with the user before non-trivial edits", promote one short `must/` rule instead of preserving the lesson only as repeated memory.
- If multiple reflections expose the same update checklist, promote one `reference/` note that states the checklist clearly and adds a short example of when to use it.

After consolidation, future retrieval should prefer the resulting stable docs and use raw reflections selectively.

## Memory ownership

- `reflector` writes `llmdoc/memory/reflections/`
- `recorder` maintains `llmdoc/memory/decisions/`
- `recorder` maintains `llmdoc/memory/doc-gaps.md`

Use `decisions/` for durable design or process decisions.
Use `memory/doc-gaps.md` to track missing or weak documentation that should be improved later.
