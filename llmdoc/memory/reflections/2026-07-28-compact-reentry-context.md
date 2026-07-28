# Compact Re-Entry Context Reflection

## Task
- Fix the llmdoc SessionStart path so cold start, resume, and compact re-entry behave differently instead of replaying the startup pack on every compaction.

## Expected vs Actual
- Expected: compact re-entry should continue from preserved task state, only re-reading docs when state is stale or evidence changes.
- Actual: the SessionStart path treated compact like a fresh startup, which forced the skill, `llmdoc/index.md`, `llmdoc/startup.md`, and MUST docs to be reloaded after every compaction.

## Root Cause
- The hook layer had collapsed lifecycle handling into one broad startup path, so compact, resume, and cold start were not routed separately.
- The compact summary did not have a stable `LLMDOC_STATE` contract with enough structure to distinguish "continue" from "rebuild."
- Verification was too weak on the warm path: it confirmed startup content existed, but not that compact re-entry skipped it.

## Missing Signals
- No explicit assertion that compact output must not replay the startup pack.
- No checked fingerprint or byte-budget signal for the startup pack, so repeated reloads were not easy to notice.
- No lifecycle-specific test or script covered `startup|clear`, `resume`, and `compact` as separate cases.
- No compact-state schema was documented well enough to show which facts must survive compaction.

## Promotion Candidates
- A stable lifecycle protocol that names cold start, resume, and compact re-entry separately.
- A compact-state shape that stores fingerprint, loaded paths, next action, and unresolved risks without copying full doc bodies.
- A small verifier script that checks matcher separation and rejects cold-start instructions in compact output.
- A bounded startup-pack rule for `index.md` + `startup.md` + `must/` so the root index stays a router, not a leaf catalog.

## Follow-up
- Keep the lifecycle-specific hook split and the startup fingerprint/24 KiB budget as the default signal for future regressions.
- When compact behavior changes again, verify both the resume fallback and the "no replay on compact" path before updating higher-level docs.
