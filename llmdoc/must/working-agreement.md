# Working Agreement

## Core Rules
- Load the `llmdoc` skill before broad exploration, planning, or documentation work.
- Prefer docs first, code and config second.
- The main assistant aligns with the user before non-trivial edits.
- Temporary investigation artifacts belong in `.llmdoc-tmp/`, not stable llmdoc docs.
- Use `/llmdoc:update` when a task changes workflow knowledge, architecture understanding, or recurring conventions.
- When `llmdoc/memory/reflections/` grows beyond 5 files, use `/llmdoc:update` to consolidate recurring lessons into plain-language `must/` or `reference/` docs.

## Editing Bias
- Keep startup docs small.
- Split stable docs by concept instead of appending large mixed documents.
- Promote only durable lessons into `must/`, `guides/`, `architecture/`, or `reference/`.
- Summarize recurring lessons into stable docs instead of carrying forward a lightly edited archive of old reflections.
