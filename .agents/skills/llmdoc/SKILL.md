---
name: llmdoc
description: >-
  Default V3 operating skill for llmdoc-enabled projects. Route broad or
  cross-subsystem discovery through the CLI retrieval surface.
allowed-tools: 'Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch'
---

# /llmdoc

This skill is the operating protocol for V3 `llmdoc` projects.

## Retrieval Gate

Treat `@tokenroll/llmdoc` as external tooling and invoke it as
`npx -y @tokenroll/llmdoc ...`. A missing package may be fetched into the npm
cache, but it must never be added to the consumer repository's `package.json`
or lockfile. Pin the version in the npx package spec when reproducibility
requires it. If the CLI remains unavailable, report the degraded path and
continue with narrowly scoped native tools.

Before the first discovery action for a task—and again whenever the
investigation expands into a new subsystem—choose the matching entry point:

- Concept, contract, term, or “where is X?” → `search <query>`.
- Background or impact of concrete source files → `context --files <path...>`.
- Cold start or unclear scope → `tree`.
- Known topic or document kind → `index --topic <topic>` / `--kind <kind>`.
- Body of already identified llmdoc documents → `show <path...>`.
- Exact source text, line numbers, tests, counts, git state, or other live facts
  inside an established working set → native source and shell tools.

Broad native discovery means recursive or cross-directory exploration outside
the working set already identified by llmdoc. Before doing that with Read,
Grep, Glob, or shell commands, apply this gate.

Once llmdoc has narrowed the working set, use native tools for exact source
verification. Do not run every retrieval command as a fixed sequence. Read
only enough to answer the task. “Stop as soon as you have enough context”
applies after selecting the entry point; it does not authorize skipping this
gate.

`status` and `delta` are not retrieval. Use them only when assessing staleness
or preparing `/llmdoc:update`; `delta` decides light vs deep.

## Operating Rules

- Preserve and reuse `LLMDOC_STATE` across continuation; do not replay prior reads unless evidence changed or the task moved.
- Temporary investigation notes belong in `.llmdoc-tmp/`, not in stable docs.
- Stable llmdoc writes belong to `recorder`.
- Before non-trivial edits, the main assistant should align with the user.
- If `llmdoc/` does not exist, suggest `/llmdoc:init`; do not fabricate the knowledge surface ad hoc.
- When a task produces durable knowledge changes, suggest `/llmdoc:update` at the end.

## Continuation State

On compact or resume, keep `LLMDOC_STATE` small and practical:

- active goal
- documents already read
- key conclusions and invariants
- user decisions and constraints
- next action
- open risks or unknowns

If that state is still sufficient, continue without re-running `tree`, `index`, or prior `show` reads.

## Roles

- `investigator`: current-state research, scoped evidence gathering, scratch reports
- `recorder`: stable llmdoc updates; `llmdoc/meta.json` changes go through the CLI only
