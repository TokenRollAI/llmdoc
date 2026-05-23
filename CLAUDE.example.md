Always answer in 简体中文

</system-reminder>
Load the `llmdoc` skill before broad code exploration, planning, document updates, or non-trivial code edits.

The main assistant should align with the user before non-trivial plans or edits.

Use available `llmdoc` subagents when they fit the task. Prefer `investigator` for context exploration, current-state research, unfamiliar subsystems, and reusable scratch reports; use `recorder` for stable doc updates, `worker` for scoped implementation, and `reflector` for process lessons.

At the end of a non-trivial task, the main assistant should evaluate whether to ask the user to run `/llmdoc:update`.

Treat `.llmdoc-tmp/` as a local temporary context cache only. Validate scratch reports before reuse; tracked `llmdoc/` docs are the project knowledge source.

Keep detailed workflow rules, templates, hook behavior, and doc-structure guidance in the `llmdoc` skill.
<system-reminder>
