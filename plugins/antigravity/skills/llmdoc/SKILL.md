---
name: llmdoc
description: "Default V3 operating skill for llmdoc-enabled projects. Route discovery — exploring code, locating contracts, judging blast radius, or configuring llmdoc.config.json (preload, reminders, external @source/ mounts) — through the llmdoc CLI instead of broad file crawling."
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# /llmdoc

Use the CLI to retrieve durable architecture, constraints, and working agreements from V3 `llmdoc/` projects. Run commands as `npx -y @tokenroll/llmdoc <cmd>`.

## Retrieval Gate

Apply this gate before the first discovery action of a task, and again whenever investigation crosses into a new subsystem. Choose the one entry point that matches the intent:

| Intent | Entry point |
|---|---|
| Concept, contract, term, "where is X?" | `search <query>` |
| Background or blast radius of concrete source files | `context --files <path...>` |
| Cold start, unclear scope | `tree` |
| Known topic, source, or kind | `index --topic <topic\|@source>` / `--kind <kind>` |
| Bodies of identified docs (local or `@source/`) | `show <path...>` |

The gate guards broad native discovery: recursive or cross-directory exploration with Read, Grep, Glob, or shell outside a working set llmdoc has already narrowed.

Once llmdoc has narrowed that working set, native tools own the exact facts — source text, line numbers, test behavior, counts, git state. The knowledge surface deliberately does not duplicate those.

These entry points are alternatives, not a sequence. Stop as soon as the task has enough context, only after choosing an entry point.

`status` and `delta` are not retrieval. Use them to assess staleness or to prepare `/llmdoc:update`, where `delta` decides light vs deep.

## CLI Invocation

`@tokenroll/llmdoc` is external tooling (`-y` resolves into the npm cache without prompts):

- Never add it to the served project's `package.json` or lockfile.
- Pin when reproducibility matters: `npx -y @tokenroll/llmdoc@<version> <cmd>`.
- Never call bare `npx llmdoc` (resolves an unrelated package).
- If CLI stays unavailable, report degraded path and use narrow native tools.

## Operating Rules

- Preserve and reuse `LLMDOC_STATE` across continuation; do not replay prior reads unless evidence changed or the task moved.
- Temporary investigation notes belong in `.llmdoc-tmp/`, not in stable docs.
- Stable `llmdoc/` writes belong to `recorder`; `llmdoc/meta.json` changes go through the CLI only (`new`, `adopt`, `mv`, `fingerprint`, `commit`). Register existing valid `.mdx` files with `adopt <path...>`; never delete-and-recreate via `new`.
- Before non-trivial edits, align with the user.
- If `llmdoc/` does not exist, suggest `/llmdoc:init`; do not fabricate the knowledge surface ad hoc.
- When code is mostly done, delegate needed `/llmdoc:update` alongside verification; include later fixes and finalize after verification passes.
- For topology or routing work, read [Knowledge Topology](references/knowledge-topology.md).
- For `llmdoc.config.json` (reminders, preload, or external `@source/` mounts), read [Startup Configuration](references/startup-config.md). External `@source/` docs are read-only; sync git caches with `status --refresh`.
- Never suggest `/llmdoc:upgrade`; it runs only when the user asks for it by name.

## Reflection Gate

Strong reflection signals expose a reusable project or workflow lesson:

- the user corrects an assistant assumption or action
- verification proves the chosen approach wrong
- substantial rework, rollback, or an instruction violation occurs
- a missing project signal would likely prevent recurrence

Skip transient tool failures, trivial typos, speculation, and one-task preferences unless marked durable.

On a strong signal, continue and pass compact evidence to `reflector` while fresh. It writes a privacy-safe candidate under `.llmdoc-tmp/reflections/pending/` (never transcript or tracked docs), triggering update review even without source delta. At task end, name the lesson and ask once to run `/llmdoc:update --reflection <path>`; wait for authorization.

## Continuation State

On compact/resume, keep `LLMDOC_STATE` compact:

- active goal
- documents already read
- key conclusions and invariants
- user decisions and constraints
- next action
- open risks or unknowns
- pending lesson candidates, if any

When sufficient, continue without re-running `tree`, `index`, or prior `show`.

## Roles

- `investigator`: current-state research, scoped evidence gathering, scratch reports under `.llmdoc-tmp/`
- `reflector`: turns strong corrections, verified mistakes, and major rework into structured candidates under `.llmdoc-tmp/reflections/pending/`
- `recorder`: the only writer of tracked `llmdoc/` knowledge
