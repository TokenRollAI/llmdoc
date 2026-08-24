---
name: llmdoc
description: >-
  Default V3 operating skill for llmdoc-enabled projects. Use the CLI retrieval
  surface instead of replaying large startup docs.
allowed-tools: 'Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch'
---

# /llmdoc

This skill is the operating protocol for V3 `llmdoc` projects.

## Core Rules

- Require the package `llmdoc-cli` to be installed locally so the `llmdoc` bin already exists.
- Prefer CLI retrieval over broad file-system search.
- Read only enough llmdoc content to answer the current task.
- Preserve and reuse `LLMDOC_STATE` across continuation; do not replay prior reads unless evidence changed or the task moved.
- Temporary investigation notes belong in `.llmdoc-tmp/`, not in stable docs.
- Stable llmdoc writes belong to `recorder`.
- Before non-trivial edits, the main assistant should align with the user.
- If `llmdoc/` does not exist, suggest `/llmdoc:init`; do not fabricate the knowledge surface ad hoc.
- When a task produces durable knowledge changes, suggest `/llmdoc:update` at the end.

## Progressive Retrieval

When `llmdoc/` exists, use this order and stop as soon as you have enough context:

1. `npx llmdoc tree`
   - Get the root map and candidate topics.

2. `npx llmdoc index --topic <topic>` or `npx llmdoc index --kind <kind>`
   - Inspect document metadata before opening bodies.

3. `npx llmdoc context --files <path...>`
   - Use when the task is tied to concrete source files.

4. `npx llmdoc search <query>`
   - Use when the task is phrased as a concept, contract, or term.

5. `npx llmdoc show <path...>`
   - Read only the selected documents that still look necessary.

6. `npx llmdoc status`
   - Check whether the knowledge surface looks stale or needs follow-up sync.

7. `npx llmdoc delta`
   - Use before `/llmdoc:update` to decide whether a light or deep sync is required.

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
- `recorder`: stable llmdoc updates and `llmdoc/meta.json`

## Hooks

The hook shell is intentionally thin.

- `SessionStart` should call `npx --no-install llmdoc hook session-start`; the CLI may emit compact plain text.
- `Stop` should call `npx --no-install llmdoc hook stop`; the CLI must emit valid JSON when it exits successfully.
- `PreCompact` should call `npx --no-install llmdoc hook compact`; the CLI must emit valid JSON when it exits successfully.

Mechanical hook output shape belongs to the CLI, not to the prompt shell.
