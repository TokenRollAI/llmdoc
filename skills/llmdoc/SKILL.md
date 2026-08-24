---
name: llmdoc
description: "Default V3 operating skill for llmdoc-enabled projects. Route discovery — exploring the codebase, locating a concept or contract, judging the blast radius of a change — through the llmdoc CLI instead of broad file crawling."
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# /llmdoc

The operating protocol for V3 `llmdoc` projects. `llmdoc/` holds the architecture, constraints, and working agreements that source code does not cheaply give back; the CLI is how you reach them.

Every command below runs as `npx -y @tokenroll/llmdoc <cmd>`; the CLI Invocation section holds the full rules.

## Retrieval Gate

Apply this gate before the first discovery action of a task, and again whenever investigation crosses into a new subsystem. Choose the one entry point that matches the intent:

| Intent | Entry point |
|---|---|
| Concept, contract, term, "where is X?" | `search <query>` |
| Background or blast radius of concrete source files | `context --files <path...>` |
| Cold start, unclear scope | `tree` |
| Known topic or document kind | `index --topic <topic>` / `--kind <kind>` |
| Bodies of documents already identified | `show <path...>` |

The gate guards broad native discovery: recursive or cross-directory exploration with Read, Grep, Glob, or shell outside a working set llmdoc has already narrowed.

Once llmdoc has narrowed that working set, native tools own the exact facts — source text, line numbers, test behavior, counts, git state. The knowledge surface deliberately does not duplicate those.

These entry points are alternatives, not a sequence. Stop as soon as the task has enough context; that permission applies after choosing an entry point, never instead of choosing one.

`status` and `delta` are not retrieval. Use them to assess staleness or to prepare `/llmdoc:update`, where `delta` decides light vs deep.

## CLI Invocation

`@tokenroll/llmdoc` is external tooling, not a project dependency. `-y` lets a missing package resolve into the npm cache without a prompt.

- Never add it to the served project's `package.json` or lockfile.
- Pin in the package spec when reproducibility matters: `npx -y @tokenroll/llmdoc@<version> <cmd>`.
- Never call a bare `npx llmdoc`; that name resolves to an unrelated package.
- If the CLI stays unavailable, report the degraded path, then continue with narrowly scoped native tools.

## Operating Rules

- Preserve and reuse `LLMDOC_STATE` across continuation; do not replay prior reads unless evidence changed or the task moved.
- Temporary investigation notes belong in `.llmdoc-tmp/`, not in stable docs.
- Stable `llmdoc/` writes belong to `recorder`; `llmdoc/meta.json` changes go through the CLI only (`new`, `adopt`, `mv`, `fingerprint`, `commit`). A valid `.mdx` that already exists on disk gets its ledger entry via `adopt <path...>` — never the delete-and-recreate dance through `new`.
- Before non-trivial edits, align with the user.
- If `llmdoc/` does not exist, suggest `/llmdoc:init`; do not fabricate the knowledge surface ad hoc.
- When a task produces durable knowledge changes, suggest `/llmdoc:update` at the end.
- Never suggest `/llmdoc:upgrade`; it runs only when the user asks for it by name.

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

- `investigator`: current-state research, scoped evidence gathering, scratch reports under `.llmdoc-tmp/`
- `recorder`: the only writer of tracked `llmdoc/` knowledge
