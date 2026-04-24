# How to Consolidate Reflections into Reusable Stable Docs

## When to Use This Guide
- `llmdoc/memory/reflections/` contains more than 5 files.
- The same lesson keeps appearing across multiple reflections.
- Reflection history is starting to feel easier to search than the stable docs.

## Goal
- Move recurring lessons into stable docs and move the source reflections to an archive folder.
- Keep archived reflections as historical evidence in llmdoc/memory/reflections/archive/.
- Summarize and classify ideas instead of copying reflection narratives into a new dump file.

## Main Steps
1. Read the recent and relevant reflections together.
2. Group them by recurring lesson, not by date or task title.
3. For each group, extract one clear takeaway in plain language:
   - what to do
   - why it matters
   - what problem it prevents
4. Choose the destination:
   - `must/` for short rules that matter on nearly every run
   - `reference/` for reusable constraints, checklists, thresholds, and lookup-style examples
5. Update an existing stable doc when it already has a good home for the lesson.
6. Create a new focused doc only when no stable doc currently fits.
7. Keep examples short and concrete. Use them to clarify the rule, not to retell the whole reflection.
8. Sync `llmdoc/index.md` and make future readers prefer the stable docs before reopening raw reflections.

## Good Outcomes
- Several reflections all say "align with the user before non-trivial edits", so one short `must/` rule replaces the repeated memory.
- Several reflections expose the same update checklist, so one `reference/` note captures the checklist and a short example of when to use it.

## Failure Modes
- Creating a giant "reflection summary" file that paraphrases each reflection in order.
- Copying stories, examples, and chronology without extracting the reusable lesson.
- Leaving a stable lesson trapped in `memory/reflections/` after it is already recurring.
- Promoting long, situational stories into `must/`.

## Related Docs
- `llmdoc/must/working-agreement.md`
- `llmdoc/must/doc-routing.md`
- `llmdoc/memory/reflections/`
