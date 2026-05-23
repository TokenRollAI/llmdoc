# Doc Structure

## Model

`llmdoc` separates stable knowledge, process memory, and temporary scratch space:

- `must/`: recurring must-read startup docs
- `overview/`: project or feature identity and boundaries
- `architecture/`: ownership boundaries, flows, invariants, retrieval maps
- `guides/`: one workflow per document
- `reference/`: stable lookup facts, schemas, conventions, contracts
- `memory/`: reflections, decisions, and doc gaps
- `.llmdoc-tmp/`: local temporary context cache for scratch artifacts

Why this split works:

- stable docs stay small and reusable
- transient notes stop polluting architecture docs
- temporary reports can go stale or disappear without contaminating long-lived docs

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
- Keep temporary investigation reports in `.llmdoc-tmp/`, not in `llmdoc/memory/`.

## Temporary Context Cache

`.llmdoc-tmp/` is deliberately outside stable llmdoc.

Use it for:

- investigator scratch reports under `.llmdoc-tmp/investigations/`
- hook logs or other local run artifacts
- temporary handoff notes that may help the current or next nearby session

Do not use it for:

- current-state snapshots that should be trusted by future users
- tracked project documentation
- entries in `llmdoc/index.md`
- durable decisions, reflections, or doc gaps

Scratch reports may survive across sessions, but they are still temporary. Reuse them only after validating their recorded git revision, scope, and unresolved gaps against the current repository. If they are stale, delete or ignore them and investigate again.

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
