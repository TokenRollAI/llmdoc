# Init Investigation Depth Reflection

## Task
- Adjust the `/llmdoc:init` workflow so it launches more subagents and reaches deeper investigation coverage.

## Expected vs Actual
- Expected outcome: init should gather enough evidence through multiple focused investigation passes to bootstrap useful docs.
- Actual outcome: the documented workflow biased the system toward too few investigators, and Codex depth limits reinforced that shallow behavior.

## What Went Wrong
- The init contract framed investigation as a single-agent default and treated splitting as an exception.
- Runtime limits in `.codex/config.toml` were tight enough to cap follow-up depth.
- Public summaries did not make the intended multi-investigator behavior visible.

## Root Cause
- The workflow was optimized for minimal orchestration rather than for coverage and retrieval quality during bootstrap.
- The command contract, public docs, and Codex config had drifted into the same conservative bias.

## Missing Docs or Signals
- There was no stable architecture doc explaining how init investigation should fan out and converge.
- There was no guide describing how to tune investigation depth across both command text and Codex config.

## Promotion Candidates
- A stable architecture doc for init investigation orchestration.
- A guide for adjusting init investigation depth and validating the change.
- A reference doc that names the repo surfaces involved in workflow behavior.

## Follow-up
- Reuse the new architecture and guide docs when `/llmdoc:init`, `.codex/config.toml`, or the public README summaries change again.
