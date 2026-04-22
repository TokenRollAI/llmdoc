# Context Overflow Recovery and Platform Limit Confirmation

## Task
- Extend the investigator failure-recovery protocol to cover context window overflow, and anchor it to confirmed platform concurrency limits.

## Confirmed Platform Limits

| Platform | Concurrency | Depth | Behavior at limit |
|----------|-------------|-------|-------------------|
| Claude Code | Hard 10 | 1 level (subagents cannot spawn subagents) | Auto-queues; does not reject |
| Codex | `max_threads = 8` | `max_depth = 2` | Blocks fan-out; does not queue |

Key distinction: Claude Code queues gracefully; Codex blocks. Recovery strategies that add concurrent investigators are safe on Claude Code (they queue at 10), but dangerous on Codex (blocked when `max_threads` is saturated).

## What Went Wrong (Prior Protocol Gap)

The protocol defined three investigator result states: `persisted`, `write_failed_fallback_ready`, `transport_failure`. None of these covered the case where the subagent's context window overflows mid-run, producing a partial file that exists on disk but was never completed. The coordinating assistant would treat this truncated file as a valid `persisted` report, letting incomplete evidence enter the coverage gate silently.

## Design Decisions

**Sentinel `<!-- llmdoc:eor -->`**: each investigator appends this HTML comment as the last line of every markdown report. The coordinating assistant now checks for the sentinel as part of verification. A file without the sentinel is `context_overflow`, not `persisted`. The sentinel is an HTML comment — invisible in rendered markdown if accidentally included in stable docs, and automatically cleaned up with `.llmdoc-tmp/` at the end of init.

**Fourth observation state `context_overflow`**: inferred by the coordinating assistant when the report file exists but the sentinel is missing. It is not returned by the subagent (the subagent is unaware of its own overflow).

**Recovery via follow-up slot, not parallel fan-out**: `context_overflow` means the brief was too wide. Retrying with the same scope will overflow again. Instead, split the topic into ≤3 narrower sub-briefs and route them through the existing follow-up slot. On Claude Code sub-briefs can be concurrent (they queue). On Codex, serialize to respect `max_threads` and `max_depth`.

**Brief size cap**: each investigator brief is capped at ≤5 questions and ≤15 specific files or symbols at launch. This prevents overflow rather than relying on recovery.

## Root Cause of the Gap

The original protocol was designed to handle write failures and transport failures — both cases where the report either exists or doesn't. Partial writes (file exists, content truncated) were not considered because the protocol assumed `Write` is atomic. In practice, a context overflow produces a partial file that appears to have "succeeded" from the filesystem's perspective.

## Promotion Candidates

All promoted in this update:
- Sentinel requirement and `context_overflow` state → architecture invariants and all four protocol surfaces
- Brief size cap → investigator prompt and Codex TOML
- Platform-aware recovery (queue vs block) → architecture doc and guide
- README sections: investigator failure table and platform limit note

## Follow-up

- If the Codex `max_depth` is increased from 2, the recovery strategy for Codex can be relaxed to allow limited concurrent sub-briefs. Update the architecture note and guide at that point.
- If Claude Code ships `maxParallelAgents`, the protocol can surface a recommended cap. For now, 10 is the platform default and cannot be configured lower or higher.
- The brief size cap (≤5 questions / ≤15 files) is a conservative starting point. If experience shows investigators consistently run out of questions before context, the cap can be relaxed.
