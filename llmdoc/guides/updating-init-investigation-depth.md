# How to Update Init Investigation Depth, Persistence Fallback, Coverage, Follow-up, and Synthesis

## Preconditions
- Confirm whether the weak behavior comes from command guidance, agent prompts, runtime config, or all three.
- Read `llmdoc/architecture/init-investigation-orchestration.md` before editing.

## Main Steps
1. Inspect `commands/init.md` to see whether investigation still uses thematic splitting, repository-size thresholds, explicit persistence checks, explicit coverage expectations, and targeted follow-up instead of a fixed second full-repo pass.
2. Inspect `.codex/config.toml` to see whether `max_threads` or `max_depth` will cap the intended orchestration.
3. Inspect `agents/investigator.md` and `.codex/agents/llmdoc-investigator.toml` to confirm that file-sink investigations: (a) end every report with the `<!-- llmdoc:eor -->` sentinel, (b) cap each brief to ≤5 questions and ≤15 files, (c) try direct persistence first, (d) perform a best-effort sidecar `Write` to `<output_path>.sidecar.md`, and (e) return fallback-ready payloads when primary writes fail.
4. Inspect `agents/recorder.md` to see whether stable-doc synthesis preserves depth or pushes the workflow toward premature fragmentation.
5. Update the init contract so it keeps all major themes in scope while capping first-wave fan-out by repository size:
   - small: `<= 1000 LOC`
   - medium: `1001-5000 LOC`
   - large: `> 5000 LOC`
6. Keep dependency, generated, cache, and VCS directories excluded from sizing and investigation. At minimum, the contract should name `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `vendor/`, and `.git/`.
7. Update the init contract so file-sink investigations distinguish `result returned` from `report persisted`, and so the coordinating assistant can persist fallback-ready reports before coverage continues.
8. Keep direct investigator persistence on the normal path, but require the fallback order to stay:
   - investigator writes successfully (sentinel must be present for `persisted` to be accepted)
   - coordinating assistant writes fallback markdown to the same path
   - on `transport_failure`, coordinating assistant first checks `output_path`; if only the sidecar is complete, it copies the sidecar back to `output_path` and verifies the restored canonical file before considering a rerun
   - on `context_overflow` (file exists, sentinel missing), split the brief into ≤3 sub-briefs and route via follow-up; do not rerun the same scope
   - user authorization is requested only if the fallback write fails and no valid sidecar restore copy can produce the canonical `output_path`
9. Update the init contract so follow-up is driven by a coverage gate, with these outcomes:
   - `pass`
   - `pass with gaps`
   - `targeted follow-up required`
10. Keep follow-up scoped to `missing_topics`, `conflicts`, `user_supplements_to_verify`, and `doc_structure_risks`. Do not let it re-run the whole repo.
11. Update `recorder` rules so init favors a few deep core docs before wider splitting.
12. Update public summaries in `README.md` and `README.zh-CN.md` so they match the actual contract.
13. If the change reveals a recurring lesson, record it in a reflection and promote stable parts into architecture or reference docs.

## Verification
- `commands/init.md` explicitly describes thematic splitting, repository-size fan-out thresholds, investigator-to-main-agent persistence fallback, coverage expectations, direct recorder reads of raw investigation reports, and targeted follow-up behavior.
- `agents/investigator.md`, `.codex/agents/llmdoc-investigator.toml`, `commands/init.md`, and `skills/llmdoc-init/SKILL.md` agree on the four file-sink outcomes: `persisted` (file + sentinel present), `write_failed_fallback_ready`, the main-agent-inferred `transport_failure`, and the main-agent-inferred `context_overflow` (file present, sentinel missing). Investigator-side surfaces include the `<!-- llmdoc:eor -->` sentinel requirement, the ≤5-question/≤15-file brief cap, the best-effort sidecar write, and the `SIDECAR_PATH` field.
- `agents/recorder.md` allows size-aware deep core docs during init instead of forcing early fragmentation, with large repositories allowed a wider first-pass core set than small and medium repositories.
- Recovery rules treat `output_path` as the canonical artifact and use sidecars only as copy sources for restoring that canonical file, never as persisted end state on their own.
- `commands/init.md` excludes dependency and generated directories from both sizing and investigation.
- `commands/init.md` requires coverage to wait for persisted and verified investigation files instead of notification-only results.
- `commands/init.md` keeps follow-up conditional for small and medium repositories, while large repositories default to one targeted follow-up pass.
- `.codex/config.toml` no longer blocks the intended depth.
- The English and Chinese README summaries match the command behavior.

## Common Failure Points
- Fixing only command text while leaving agent limits too tight.
- Raising concurrency without documenting how investigation should be split, how size thresholds apply, or what "enough coverage" means.
- Letting notification text masquerade as a persisted report, so coverage starts before the scratch files exist.
- Treating a missing or internal-error tool return as a rerun trigger without first checking `output_path` and the sidecar on disk, which re-runs investigators whose reports are already persisted.
- Continuing from a sidecar-only file without restoring `output_path`, which leaves the canonical artifact missing and breaks the persisted contract.
- Treating a report file without the `<!-- llmdoc:eor -->` sentinel as `persisted` — a truncated report silently entering the coverage gate produces shallow or contradictory stable docs.
- Retrying a `context_overflow` investigator with the same brief scope — the same context limit will truncate it again. Split and use follow-up instead.
- Spawning concurrent recovery investigators in Codex when `max_threads` or `max_depth` is already saturated — excess investigators are blocked, not queued, unlike Claude Code.
- Falling back to user authorization too early instead of first letting the coordinating assistant persist the returned markdown.
- Improving investigation depth without changing how `recorder` consumes and preserves that depth.
- Letting follow-up drift into a second full-repo pass instead of a targeted repair phase.
- Counting `node_modules/` and other generated directories toward repository size, which inflates fan-out decisions and slows init.
- Updating only one README and leaving the other public surface stale.

## Related Docs
- `llmdoc/architecture/init-investigation-orchestration.md`
- `llmdoc/reference/repo-surfaces.md`
