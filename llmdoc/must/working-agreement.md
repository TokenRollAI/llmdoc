# Working Agreement

## Core Rules
- Load the `llmdoc` skill before broad exploration, planning, or documentation work.
- Prefer docs first, code and config second.
- The main assistant aligns with the user before non-trivial edits.
- Temporary investigation artifacts belong in `.llmdoc-tmp/`, not stable llmdoc docs.
- Use `/llmdoc:update` when a task changes workflow knowledge, architecture understanding, or recurring conventions.

## Editing Bias
- Keep startup docs small.
- Split stable docs by concept instead of appending large mixed documents.
- Promote only durable lessons into `must/`, `guides/`, `architecture/`, or `reference/`.
