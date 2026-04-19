# How to Update Init Investigation Depth, Coverage, Follow-up, and Synthesis

## Preconditions
- Confirm whether the weak behavior comes from command guidance, agent prompts, runtime config, or all three.
- Read `llmdoc/architecture/init-investigation-orchestration.md` before editing.

## Main Steps
1. Inspect `commands/init.md` to see whether investigation still uses thematic splitting, repository-size thresholds, explicit coverage expectations, and targeted follow-up instead of a fixed second full-repo pass.
2. Inspect `.codex/config.toml` to see whether `max_threads` or `max_depth` will cap the intended orchestration.
3. Inspect `agents/recorder.md` to see whether stable-doc synthesis preserves depth or pushes the workflow toward premature fragmentation.
4. Update the init contract so it keeps all major themes in scope while capping first-wave fan-out by repository size:
   - small: `<= 1000 LOC`
   - medium: `1001-5000 LOC`
   - large: `> 5000 LOC`
5. Keep dependency, generated, cache, and VCS directories excluded from sizing and investigation. At minimum, the contract should name `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `vendor/`, and `.git/`.
6. Update the init contract so follow-up is driven by a coverage gate, with these outcomes:
   - `pass`
   - `pass with gaps`
   - `targeted follow-up required`
7. Keep follow-up scoped to `missing_topics`, `conflicts`, `user_supplements_to_verify`, and `doc_structure_risks`. Do not let it re-run the whole repo.
8. Update `recorder` rules so init favors a few deep core docs before wider splitting.
9. Update public summaries in `README.md` and `README.zh-CN.md` so they match the actual contract.
10. If the change reveals a recurring lesson, record it in a reflection and promote stable parts into architecture or reference docs.

## Verification
- `commands/init.md` explicitly describes thematic splitting, repository-size fan-out thresholds, coverage expectations, direct recorder reads of raw investigation reports, and targeted follow-up behavior.
- `agents/recorder.md` allows deep core docs during init instead of forcing early fragmentation.
- `commands/init.md` excludes dependency and generated directories from both sizing and investigation.
- `commands/init.md` keeps follow-up conditional for small and medium repositories, while large repositories default to one targeted follow-up pass.
- `.codex/config.toml` no longer blocks the intended depth.
- The English and Chinese README summaries match the command behavior.

## Common Failure Points
- Fixing only command text while leaving agent limits too tight.
- Raising concurrency without documenting how investigation should be split, how size thresholds apply, or what "enough coverage" means.
- Improving investigation depth without changing how `recorder` consumes and preserves that depth.
- Letting follow-up drift into a second full-repo pass instead of a targeted repair phase.
- Counting `node_modules/` and other generated directories toward repository size, which inflates fan-out decisions and slows init.
- Updating only one README and leaving the other public surface stale.

## Related Docs
- `llmdoc/architecture/init-investigation-orchestration.md`
- `llmdoc/reference/repo-surfaces.md`
