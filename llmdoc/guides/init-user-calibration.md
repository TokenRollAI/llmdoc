# How to Update Init User Calibration

## Preconditions
- Read `llmdoc/architecture/init-investigation-orchestration.md` before editing.
- Confirm whether the change affects the command contract, helper skill, public README summaries, or all three.

## Main Steps
1. Inspect `commands/init.md` and `skills/llmdoc-init/SKILL.md` to confirm that `/llmdoc:init` still has two user checkpoints: one before investigation and one after investigation.
2. Keep the pre-investigation checkpoint required, but always show `No extra context, continue` as an explicit user-facing option.
3. Keep the pre-investigation questions narrow. They should only cover:
   - who the project is for
   - what the core purpose or core functions are
   - which internal terms are team-specific rather than generic
   - which hidden conventions or boundaries should affect document structure
4. Keep the pre-investigation checkpoint short. It should calibrate investigation scope, terminology, and document structure instead of turning into a broad interview.
5. Keep the post-investigation checkpoint required.
6. Make the post-investigation checkpoint show a concise concept list of what is about to influence stable docs.
7. Keep the post-investigation choices narrow: generate now, or add terms, emphasis, or conventions.
8. If the user adds information, route it through the same targeted follow-up and coverage-gate mechanism used by init. Only verify the supplemented terms, emphasis, conventions, and directly related evidence.
9. Keep evidence-first behavior intact. User-confirmed project-positioning information may shape stable docs, but user input must not override repository evidence about implementation behavior or ownership.
10. Keep unverified or conflicting claims in scratch notes or explicit gaps until evidence is strong enough.
11. Synchronize `README.md`, `README.zh-CN.md`, `llmdoc/index.md`, and routing docs whenever the interaction design changes.

## Verification
- `commands/init.md` explicitly includes the pre-investigation checkpoint and requires `No extra context, continue` to be shown as an option.
- `commands/init.md` explicitly includes the required post-investigation confirmation and its two allowed actions.
- User supplements flow into targeted follow-up, not a whole-repo rerun.
- `skills/llmdoc-init/SKILL.md` matches the command contract.
- The README summaries match the actual init flow.
- Unverified or conflicting user claims do not enter stable docs as facts.

## Common Failure Points
- Turning the pre-investigation checkpoint into a broad interview.
- Letting the skip path exist only as an implied behavior instead of a visible option.
- Adding many post-investigation options that make the decision harder instead of easier.
- Treating user supplements as fact without a targeted evidence check.
- Restarting broad repository investigation when only a narrow follow-up is needed.
- Updating the command contract but forgetting the helper skill or public summaries.

## Related Docs
- `llmdoc/architecture/init-investigation-orchestration.md`
- `llmdoc/guides/updating-init-investigation-depth.md`
- `llmdoc/reference/repo-surfaces.md`
