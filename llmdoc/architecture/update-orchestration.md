# Update Orchestration

## Purpose
- Define how `/llmdoc:update` keeps tracked `llmdoc/` docs aligned with the current repository without forcing unnecessary multi-agent work.
- Preserve independent investigation when it is useful, while making immediate post-implementation updates fast.

## Knowledge Layers
- `llmdoc/`: tracked project knowledge. It should describe current architecture, implementation intent, boundaries, stable contracts, and recurring workflow rules.
- `.llmdoc-tmp/`: local temporary context cache. It may hold investigator reports or hook logs, but it is ignored by git, not indexed, and may be deleted.
- Source code and git state: the final authority for volatile facts, counts, and implementation details.

## Update Modes
- `fast`: default for immediate post-task updates by the same coordinating assistant. Use the task summary, diff, targeted checks, and any still-valid scratch reports.
- `analysis`: use when the current state needs fresh evidence, the implementation context is stale, or the impacted docs are unclear. Run one focused investigation and persist the scratch report under `.llmdoc-tmp/investigations/`.
- `full`: use when risk, disputed facts, or process learning justify separate investigator, reflector, and recorder roles.

## Invariants
- Stable docs must not describe behavior that no longer exists in the current repository.
- Stable docs should be smaller than the source they describe or add architectural explanation that source search does not provide quickly.
- Investigator reports are reusable evidence, not stable memory or source of truth.
- Reflections are written only when there is a workflow failure, repeated mistake, missing signal, or durable process lesson.
- `recorder` reconciles `llmdoc/memory/doc-gaps.md` during non-trivial updates.
- `llmdoc/index.md` never indexes `.llmdoc-tmp/`.

## Routing
- Use `must/` for short recurring rules that prevent common mistakes.
- Use `architecture/` for flows, ownership boundaries, invariants, and design intent.
- Use `reference/` for stable lookup facts and contracts.
- Use `guides/` for repeatable workflows.
- Leave raw evidence, volatile observations, and current-state scratch notes in `.llmdoc-tmp/`.
