# Load The `llmdoc` Skill First

Before broad source-code exploration, planning, or documentation work, load the `llmdoc` skill.

Load it once on cold start. After context compaction, continue from `LLMDOC_STATE` and do not replay the skill or startup pack unless the state is stale or insufficient.

The main assistant should align with the user before non-trivial plans or edits.

Use available `llmdoc` subagents when they fit the task. Prefer `investigator` for context exploration, current-state research, unfamiliar subsystems, and reusable scratch reports; use `recorder` for stable doc updates, `worker` for scoped implementation, and `reflector` for process lessons.

At the end of a non-trivial task, when the work produced durable knowledge, workflow lessons, or useful reflections, the main assistant should proactively use the `llmdoc-update` skill in Codex.

Treat `.llmdoc-tmp/` as a local temporary context cache only. Validate scratch reports before reuse; tracked `llmdoc/` docs are the project knowledge source.

Keep detailed workflow rules, templates, hook behavior, and doc-structure guidance in the `llmdoc` skill.
