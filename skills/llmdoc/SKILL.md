---
name: llmdoc
description: "Default operating skill for llmdoc-enabled projects. Use when a project has llmdoc/, when initializing llmdoc, when updating project knowledge, or when Codex CLI hooks should reinforce the workflow."
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
---

# /llmdoc

This skill is the operating system for `llmdoc` projects.

Use it whenever:

- the project already has `llmdoc/`
- the user asks to initialize or update project docs
- the task touches architecture, workflow, conventions, or doc structure
- you want Codex CLI `SessionStart` or `Stop` hooks to reinforce the workflow

## Load Order

Read these references in order:

1. `references/design-goals.md`
2. `references/operating-protocol.md`
3. `references/doc-structure.md`
4. `references/update-and-memory.md`

Then load only the specific extras you need:

- `references/templates.md` for document templates
- `references/codex-cli-hooks.md` for Codex CLI hook support

## Core Rules

- Read `llmdoc/index.md`, then `llmdoc/startup.md`, then the MUST files it lists.
- Proactively read relevant `guides/` and `memory/reflections/` before non-trivial edits.
- When `llmdoc/memory/reflections/` grows beyond 5 files, use `/llmdoc:update` to consolidate recurring lessons into plain-language `must/` or `reference/` docs instead of letting memory keep growing unchecked.
- The main assistant, not `worker`, aligns with the user before non-trivial edits.
- At the end of a non-trivial task, the main assistant should consider prompting for `/llmdoc:update`.
- Temporary investigation artifacts live in `.llmdoc-tmp/`, not `llmdoc/memory/`.
- `recorder` owns stable docs, `memory/decisions/`, and `memory/doc-gaps.md`. `reflector` owns `memory/reflections/`.

## Hook Support

Codex CLI `SessionStart` and `Stop` hook support lives here:

- `references/codex-cli-hooks.md`
- `templates/codex-hooks.json`
- `templates/session-start.sh`
- `templates/stop.sh`

Use hooks to reinforce the workflow, not to replace judgment.
