# Load `llmdoc` First

Before broad code exploration, planning, or documentation work, load the `llmdoc` skill.

This project uses llmdoc V3.

- `@tokenroll/llmdoc` is a required dependency. Install it in the project first, then use `npx llmdoc ...`.
- Prefer the CLI as the entrypoint:
  - `npx llmdoc tree`
  - `npx llmdoc index --topic ...`
  - `npx llmdoc context --files ...`
  - `npx llmdoc search ...`
  - `npx llmdoc show ...`
- The tracked knowledge model is V3:
  - `.mdx` documents use pure Markdown, YAML front matter, and only the minimal optional `<CodeRef>` enhancement
  - front matter carries `kind`
  - path is the document ID
  - `llmdoc/meta.json` stores validity ledgers
  - the tree is limited to root singleton docs plus one-level topic folders
- Do not assume a V2 startup pack, root `index.md`, `sync.md`, `worker`, or `reflector`.
- Before non-trivial plans or edits, the main assistant should align with the user.
- After compaction, continue from a compact `LLMDOC_STATE`; do not replay already sufficient reads.
- Use only two llmdoc roles when the host supports delegation:
  - `investigator` for evidence gathering into `.llmdoc-tmp/investigations/`
  - `recorder` for tracked `llmdoc/` and `meta.json` updates
- `init`, `update`, `prune`, and `upgrade` are explicit workflows with authorization semantics:
  - `init` may be suggested when llmdoc is missing
  - `update` and `prune` may be suggested, but require confirmation
  - `upgrade` is explicit only and must never be suggested proactively
- After work creates durable architecture, contract, or workflow knowledge, suggest `update` and wait for confirmation.
- Explicit workflows report exactly one result state:
  - `success`
  - `no_change`
  - `dry_run`
  - `incomplete`
  - `failed`

Treat `.llmdoc-tmp/` as temporary local context, not source-of-truth knowledge.
