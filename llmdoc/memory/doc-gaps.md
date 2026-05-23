# Documentation Gaps

## Open Gaps
- There is still no executable test or fixture that validates `/llmdoc:init` fan-out behavior against the documented contract; current confidence comes from prompt and config review.
- If runtime behavior diverges again, add a guide or fixture that checks command docs, README summaries, and `.codex/config.toml` together.
- `.codex/agents/llmdoc-investigator.toml` and `.codex/agents/llmdoc-recorder.toml` still need to mirror the new update-mode and temporary-cache rules once the hidden `.codex/` directory is writable in the working environment.
