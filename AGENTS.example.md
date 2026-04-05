# Load The `llmdoc` Skill First

Before broad source-code exploration, planning, or documentation work, load the `llmdoc` skill.

The main assistant should align with the user before non-trivial plans or edits.

At the end of a non-trivial task, the main assistant should evaluate whether to ask the user to run `/llmdoc:update`.

Keep detailed workflow rules, templates, hook behavior, and doc-structure guidance in the `llmdoc` skill.
