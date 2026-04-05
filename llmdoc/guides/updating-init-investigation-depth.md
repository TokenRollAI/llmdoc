# How to Update Init Investigation Depth, Coverage, and Synthesis

## Preconditions
- Confirm whether the weak behavior comes from command guidance, agent prompts, runtime config, or all three.
- Read `llmdoc/architecture/init-investigation-orchestration.md` before editing.

## Main Steps
1. Inspect `commands/init.md` to see whether investigation defaults to one broad pass or multiple focused passes, and whether it makes coverage expectations explicit.
2. Inspect `.codex/config.toml` to see whether `max_threads` or `max_depth` will cap the intended orchestration.
3. Inspect `agents/recorder.md` to see whether stable-doc synthesis preserves depth or pushes the workflow toward premature fragmentation.
4. Update the init contract so it specifies thematic splitting, a reasonable default investigator count, explicit major-surface coverage, direct recorder access to raw investigation reports, and a follow-up gap-check pass.
5. Update `recorder` rules so init favors a few deep core docs before wider splitting.
6. Update public summaries in `README.md` and `README.zh-CN.md` so they match the actual contract.
7. If the change reveals a recurring lesson, record it in a reflection and promote stable parts into architecture or reference docs.

## Verification
- `commands/init.md` explicitly describes multiple focused investigators, coverage expectations, direct recorder reads of raw investigation reports, and a follow-up pass.
- `agents/recorder.md` allows deep core docs during init instead of forcing early fragmentation.
- `.codex/config.toml` no longer blocks the intended depth.
- The English and Chinese README summaries match the command behavior.

## Common Failure Points
- Fixing only command text while leaving agent limits too tight.
- Raising concurrency without documenting how investigation should be split or what "enough coverage" means.
- Improving investigation depth without changing how `recorder` consumes and preserves that depth.
- Updating only one README and leaving the other public surface stale.

## Related Docs
- `llmdoc/architecture/init-investigation-orchestration.md`
- `llmdoc/reference/repo-surfaces.md`
