# How to Update Init Investigation Depth

## Preconditions
- Confirm whether the shallow or overly broad behavior comes from command guidance, agent prompts, runtime config, or all three.
- Read `llmdoc/architecture/init-investigation-orchestration.md` before editing.

## Main Steps
1. Inspect `commands/init.md` to see whether investigation defaults to one broad pass or multiple focused passes.
2. Inspect `.codex/config.toml` to see whether `max_threads` or `max_depth` will cap the intended orchestration.
3. Update the init contract so it specifies thematic splitting, a reasonable default investigator count, and a follow-up gap-check pass.
4. Update public summaries in `README.md` and `README.zh-CN.md` so they match the actual contract.
5. If the change reveals a recurring lesson, record it in a reflection and promote stable parts into architecture or reference docs.

## Verification
- `commands/init.md` explicitly describes multiple focused investigators and a follow-up pass.
- `.codex/config.toml` no longer blocks the intended depth.
- The English and Chinese README summaries match the command behavior.

## Common Failure Points
- Fixing only command text while leaving agent limits too tight.
- Raising concurrency without documenting how investigation should be split.
- Updating only one README and leaving the other public surface stale.

## Related Docs
- `llmdoc/architecture/init-investigation-orchestration.md`
- `llmdoc/reference/repo-surfaces.md`
