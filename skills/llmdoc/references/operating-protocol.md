# Operating Protocol

## Startup reads

If `llmdoc/` exists:

1. Read `llmdoc/index.md`.
2. Read `llmdoc/startup.md` when it exists.
3. Read the MUST files listed there, in order.
4. Proactively read task-relevant `guides/` and `memory/reflections/` before planning or editing.
5. Read the remaining task-relevant docs from `overview/`, `architecture/`, and `reference/`.

When recurring lessons have already been promoted into stable docs, prefer those stable docs first and use raw reflections selectively.

Why:

- startup reads give the minimum common context
- proactive guide reads reduce avoidable implementation mistakes
- proactive reflection reads reduce repeated workflow mistakes
- promoted stable docs keep reflection history from becoming the default retrieval surface

## Re-entry rules

During execution, re-read relevant docs before broad code search when:

- entering a new subsystem
- seeing conflicting evidence
- hitting a failed command or test
- needing stronger confidence before editing
- seeing a related guide or reflection that might improve quality

## Collaboration

Before planning or editing non-trivial code, the main assistant should actively synchronize with the user unless the request is trivial and unambiguous.

Do this by default:

1. State the current understanding of the task.
2. Surface the main assumptions, risks, or tradeoffs.
3. Ask focused questions when scope, intent, or constraints are unclear.
4. Discuss the likely approach before writing non-trivial code or restructuring docs.

This collaboration rule is for the coordinating assistant, not for execution-only worker subagents.

## Code reference policy

Default to file or symbol granularity:

`path/to/file.ext` (`SymbolName`): Brief description.

Add line numbers only when needed to prove a disputed, subtle, or non-obvious behavior.
