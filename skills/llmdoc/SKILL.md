---
name: llmdoc
description: "Default operating skill for llmdoc-enabled projects. Use at cold start when a project has llmdoc/, when initializing or updating project knowledge, or when configuring Codex lifecycle hooks. After context compaction, continue from preserved LLMDOC_STATE and do not repeat cold-start reads unless the state is stale or insufficient."
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# /llmdoc

This skill is the operating system for `llmdoc` projects.

Use it whenever:

- the project already has `llmdoc/`
- the user asks to initialize or update project docs
- the task touches architecture, workflow, conventions, or doc structure
- you want Codex CLI `SessionStart` or `Stop` hooks to reinforce the workflow

## Cold-start Load Order

Read these references once at cold start, in order:

1. `references/design-goals.md`
2. `references/operating-protocol.md`
3. `references/doc-structure.md`
4. `references/update-and-memory.md`
5. `references/lessons-learned.md`

Then load only the specific extras you need:

- `references/templates.md` for document templates
- `references/codex-cli-hooks.md` for Codex CLI hook support

After a context compaction, do not read this skill or its references again merely because compaction occurred. Continue from the compact summary and its `LLMDOC_STATE`; use the re-entry rules in `references/operating-protocol.md` when targeted refresh is necessary.

## Core Rules

- On cold start, read `llmdoc/index.md`, then `llmdoc/startup.md`, then the MUST files it lists.
- Treat context compaction as warm re-entry, not a new run. Do not reload the startup pack or already-loaded task docs unless state or evidence invalidates them.
- Proactively read relevant `guides/` and `memory/reflections/` before non-trivial edits.
- The main assistant, not `worker`, aligns with the user before non-trivial edits.
- At the end of a non-trivial task, the main assistant should consider prompting for `/llmdoc:update`.
- Temporary investigation artifacts live in `.llmdoc-tmp/`, not `llmdoc/memory/`.
- `.llmdoc-tmp/` is a local temporary context cache. It may help nearby sessions, but it is ignored by git, not indexed, and not a source of truth.
- `recorder` owns stable docs, `memory/decisions/`, and `memory/doc-gaps.md`. `reflector` owns `memory/reflections/`.

## Hook Support

Codex CLI `SessionStart` and `Stop` hook support lives here:

- `references/codex-cli-hooks.md`
- `scripts/verify-lifecycle-hooks.sh`
- `templates/codex-hooks.json`
- `templates/session-start.sh`
- `templates/stop.sh`

Use hooks to reinforce the workflow, not to replace judgment.
