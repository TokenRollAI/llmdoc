---
name: llmdoc
description: "Default V3 operating skill for llmdoc-enabled projects. Use the CLI retrieval surface instead of replaying large startup docs."
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# /llmdoc

This skill is the operating protocol for V3 `llmdoc` projects.

## Core Rules

- Require the package `@tokenroll/llmdoc` to be installed locally so the `llmdoc` bin already exists.
- Prefer CLI retrieval over broad file-system search.
- Read only enough llmdoc content to answer the current task.
- Preserve and reuse `LLMDOC_STATE` across continuation; do not replay prior reads unless evidence changed or the task moved.
- Temporary investigation notes belong in `.llmdoc-tmp/`, not in stable docs.
- Stable llmdoc writes belong to `recorder`.
- Before non-trivial edits, the main assistant should align with the user.
- If `llmdoc/` does not exist, suggest `/llmdoc:init`; do not fabricate the knowledge surface ad hoc.
- When a task produces durable knowledge changes, suggest `/llmdoc:update` at the end.

## Progressive Retrieval

Pick the entry point that matches the task; do not run these as a fixed sequence, and stop as soon as you have enough context:

- Cold start or unclear scope → `npx @tokenroll/llmdoc tree` for the global map, then descend.
- The task names concrete source files → `npx @tokenroll/llmdoc context --files <path...>` (you may skip `tree`).
- The task names a concept, contract, or term → `npx @tokenroll/llmdoc search <query>`.
- Browsing a known topic or kind → `npx @tokenroll/llmdoc index --topic <topic>` / `--kind <kind>`.
- Read bodies last, and only the few that still matter → `npx @tokenroll/llmdoc show <path...>`.

`status` and `delta` are not retrieval: use them only when assessing staleness or preparing `/llmdoc:update` (`delta` decides light vs deep).

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
