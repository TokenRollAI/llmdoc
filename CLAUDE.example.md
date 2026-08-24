Load the `llmdoc` skill before broad code exploration, planning, doc updates, or non-trivial edits.

This project uses llmdoc V3.

- `llmdoc-cli` is required: install it in the project, then use `npx llmdoc ...` as the normal entrypoint (start from `npx llmdoc tree`).
- The full operating protocol (progressive retrieval, `LLMDOC_STATE`, roles) lives in the `llmdoc` skill — follow it, do not improvise a parallel workflow.
- `init` / `update` / `prune` are explicit workflows: suggest them when relevant, run them only after user confirmation. Never suggest `upgrade` proactively.
- After work that creates durable architecture, contract, or workflow knowledge, suggest `/llmdoc:update`.
- Treat `.llmdoc-tmp/` as temporary local context, not source-of-truth knowledge.
