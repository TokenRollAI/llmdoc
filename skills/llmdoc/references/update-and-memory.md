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
