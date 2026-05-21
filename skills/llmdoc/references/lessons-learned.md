# Lessons Learned And Memory Archive

This reference is the single source of truth for the optional curated memory file:

- `llmdoc/memory/lessons-learned.md`

The file is a compact index of reusable behavioral rules distilled from accumulated memory files. It is useful when a project has accumulated enough memory that future sessions should read a summary instead of every raw note.

## Trigger

During `/llmdoc:update`, automatically run a memory summary/archive pass when active memory files exceed 5.

Active memory files are files under `llmdoc/memory/` excluding:

- `llmdoc/memory/lessons-learned.md`
- `llmdoc/memory/doc-gaps.md`
- anything under `llmdoc/memory/archive/`

The threshold check should happen after the new task reflection is written, so the newest lesson is included.

## What Belongs Here

Use `memory/lessons-learned.md` for:

- cross-task rules that should change future agent behavior
- recurring engineering discipline
- repeated workflow mistakes and their corrected rule
- source-linked lessons extracted from one or more reflections

Do not use it for:

- raw task narratives, which belong in `memory/reflections/`
- durable decisions, which belong in `memory/decisions/`
- missing-doc inventory, which belongs in `memory/doc-gaps.md`
- full workflow instructions, which belong in `guides/`

## Archive Rule

When the threshold is crossed:

1. Read the active memory files.
2. Extract compact, actionable, recurring rules.
3. Add or revise matching entries in `memory/lessons-learned.md`.
4. Link each entry back to the source memory file before moving it.
5. Move summarized raw memory files into `llmdoc/memory/archive/YYYY-MM-DD/`.
6. Leave unsummarized active memory files in place if they still need direct follow-up.
7. Do not duplicate the same instruction across prompts, agents, README files, and stable docs.

This is a memory compaction step, not a stable-doc rewrite. Promote a lesson into `must/`, `guides/`, `architecture/`, or `reference/` only when it is mature enough to become stable project guidance.

If the count is 5 or lower, do not update `lessons-learned.md` just because a single task produced a useful rule. Let raw reflections accumulate until the archive threshold is crossed.

## Template

```md
# Lessons Learned

Curated cross-task rules distilled from archived memory.

## <Theme>

### <Rule Name>
**Rule**: One actionable sentence.
**Why**: One sentence naming the failure, correction, or discovery that produced the rule.
**Source**: `llmdoc/memory/archive/YYYY-MM-DD/<source-file>.md`
```

## Hook Reinforcement

Hooks may remind the assistant that the active-memory count crossed the archive threshold, but the detailed behavior should stay here.
