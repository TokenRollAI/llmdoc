# Subagent Transport Failure Reflection

## Task
- Extend the init investigation protocol to handle Claude Code tool-framework errors where the entire subagent tool call returns `[Tool result missing due to internal error]`.

## Expected vs Actual
- Expected: when an investigator fails, the fallback protocol kicks in and the main agent either writes `report_markdown` to disk or degrades cleanly.
- Actual: when the tool framework itself loses the subagent's return payload, the main agent has no STATUS, no `failure_type`, no `failure_message`, and no `report_markdown`. It cannot degrade because degradation assumes "markdown in hand".

## What Went Wrong
- The protocol defined only two return states: `persisted` and `write_failed_fallback_ready`. Both assume the tool transport layer itself is healthy.
- Transport-level failures (missing tool result, internal error) were implicitly treated the same as a missed timeout, so the only recovery path was a full rerun.
- On a `required batch` shard such as a deep architecture slice, a missing subagent result blocks the coverage gate and forces a rerun even when the file may already be on disk.

## Root Cause
- The fallback taxonomy conflated subagent protocol failure with transport failure. One has markdown to recover from; the other does not.
- Neither side of the protocol wrote a durable artifact outside the return channel, so when the return channel broke, there was nothing to salvage.

## Missing Docs or Signals
- No documented recovery path for transport-layer failure.
- No instruction to the main agent to check `output_path` on disk before concluding the subagent produced nothing.
- No sidecar or equivalent best-effort artifact that survives a lost tool return.

## Promotion Candidates
- Add a third observation state `transport_failure` to the init contract. It is inferred by the main agent, not returned by the investigator.
- Require the main agent to verify `output_path` on disk before rerunning on a missing tool result. A report that reached disk is not lost just because the tool return was.
- Require the investigator to mirror `report_markdown` to a sidecar path as a best-effort recovery lane before returning, so even a lost tool result leaves something to degrade from.
- Update `agents/investigator.md` OutputFormat_File so the sidecar write is part of the contract, not an optional tweak.
- Update `llmdoc/guides/updating-init-investigation-depth.md` verification to cover the three-state taxonomy.

## Follow-up
- When persistence stabilizes, re-evaluate whether the sidecar can be dropped on the success path to avoid double IO. On the failure path, keep it.
- If future framework errors expose a fourth failure mode (for example truncated markdown), extend the taxonomy rather than overloading `transport_failure`.
