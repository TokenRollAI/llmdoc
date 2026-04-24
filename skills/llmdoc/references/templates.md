# Templates

## `index.md`

```md
# llmdoc Index

## Purpose
- This file is the global map of the llmdoc system.
- If `startup.md` exists, startup reading continues there.

## Categories
- `must/`: startup pack for recurring task context
- `overview/`: project and feature identity
- `architecture/`: flows, invariants, and ownership boundaries
- `guides/`: workflow-specific instructions
- `reference/`: stable lookup facts and contracts
- `memory/`: reflections, decisions, and doc gaps

## Key Documents
- `llmdoc/startup.md`: startup reading order
- `llmdoc/overview/project-overview.md`: project identity and boundaries
- Add the main architecture, guide, and reference docs here with one-line descriptions

## Routing Rules
- Read `startup.md` for startup context
- Read `guides/` before editing a known workflow
- Read the relevant stable docs first, then `memory/reflections/` selectively when you need the original task context for a repeated workflow or problematic subsystem
```

## `startup.md`

```md
# Startup

Read in order on every run:

1. `llmdoc/must/project-basics.md`
2. `llmdoc/must/working-agreement.md`
3. `llmdoc/must/doc-routing.md`

Escalate to more docs when:
- touching a specific subsystem
- changing architecture or conventions
- updating workflows or stable docs

Read related guides and the relevant stable docs or reflections before editing when available.
```

## `overview/project-overview.md`

```md
# Project Overview

## Identity
- What this project is.
- What problem it solves.

## Boundaries
- What belongs here.
- What does not belong here.

## Major Areas
- Main subsystems and their roles.
```

## `architecture/<concept>.md`

```md
# Architecture of <Concept>

## Purpose
- Why this subsystem exists.

## Core Components
- `path/to/file.ext` (`SymbolName`): Responsibility.

## Flow
- Entry point.
- Main delegation path.
- Important invariants or failure points.

## Related Docs
- Other llmdoc paths to read next.
```

## `guides/<workflow>.md`

```md
# How to <Do One Thing>

1. Preconditions
2. Main steps
3. Verification
4. Common failure points
5. Related docs
```

## `reference/<topic>.md`

```md
# <Topic> Reference

## Scope
- What this document covers.

## Stable Facts
- Contracts, schemas, conventions, or rules.

## Sources of Truth
- `path/to/file.ext` (`SymbolName`): Why it matters.
```

## `memory/reflections/<task>.md`

```md
# <Task> Reflection

## Task
- What was attempted.

## Expected vs Actual
- Expected outcome.
- Actual outcome.

## What Went Wrong
- Mistakes, bad assumptions, or rework.

## Root Cause
- Why it happened.

## Missing Docs or Signals
- What documentation or prompt signal was missing.

## Promotion Candidates
- What might be promoted to `must/`, `guides/`, or `reference/`.

## Follow-up
- Concrete next action.
```

## `.llmdoc-tmp/investigations/<topic>.md`

```md
# Investigation Scratch Report

## Goal
- What questions this scratch report answers.

## Evidence
- `path/to/file.ext` (`SymbolName`): Relevant fact.

## Interim Findings
- Working conclusions for init or update.

## Promotion Notes
- What should become stable docs.
- What should stay temporary and be deleted later.
```
