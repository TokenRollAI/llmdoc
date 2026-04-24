# Doc Structure

## Model

`llmdoc` separates stable knowledge, process memory, and temporary scratch space:

- `must/`: recurring must-read startup docs
- `overview/`: project or feature identity and boundaries
- `architecture/`: ownership boundaries, flows, invariants, retrieval maps
- `guides/`: one workflow per document
- `reference/`: stable lookup facts, schemas, conventions, contracts
- `memory/`: reflections, decisions, and doc gaps
- `.llmdoc-tmp/`: temporary investigation scratch artifacts

Why this split works:

- stable docs stay small and reusable
- transient notes stop polluting architecture docs
- temporary reports can go stale without contaminating long-lived docs

## Index responsibilities

`llmdoc/index.md` and `llmdoc/startup.md` must not duplicate each other.

Use this split:

- `llmdoc/index.md`: global map of the documentation system
- `llmdoc/startup.md`: startup reading order for recurring must-read docs

`llmdoc/index.md` should contain:

- the purpose of each top-level category
- the major documents available in each category
- routing hints for `must/`, `overview/`, `architecture/`, `guides/`, `reference/`, and `memory/`

`llmdoc/startup.md` should contain:

- only the startup reading order
- short escalation hints for what to read next

## Ownership

- `recorder` owns `llmdoc/index.md`, `llmdoc/startup.md`, all stable docs, `memory/decisions/`, and `memory/doc-gaps.md`
- `reflector` owns `memory/reflections/`
- temporary investigation scratch stays in `.llmdoc-tmp/`

## Splitting rules

- One concept per document.
- One workflow per guide.
- One ownership boundary or invariant cluster per architecture doc.
- Put repeated startup knowledge in `must/`, not in `overview/`.
- Put mistakes and raw learnings in `memory/reflections/`, then promote only recurring stable lessons.
- When reflections exceed 5 files, consolidate recurring patterns into plain-language `must/` or `reference/` docs so `memory/` does not become the default retrieval surface.
- Keep temporary investigation reports in `.llmdoc-tmp/`, not in `llmdoc/memory/`.

## Recommended architecture slicing

Prefer slicing by responsibility, ownership, or runtime flow.

Good architecture doc families:

- request or command flow
- domain model and invariants
- persistence and data ownership
- external integrations
- async jobs and background processing
- frontend composition and state boundaries
- agent and workflow orchestration
