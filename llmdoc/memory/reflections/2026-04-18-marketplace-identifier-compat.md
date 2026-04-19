# Marketplace Identifier Compatibility Reflection

## Task
- Align Codex and Claude plugin marketplace metadata, renaming the local marketplace from `llmdoc-local` to `llmdoc-cc-plugin` and consolidating description metadata.

## Expected vs Actual
- Expected: users install `llmdoc@llmdoc-cc-plugin` and it just works.
- Actual: users with cached entries under older names (`llmdoc-local`, `tokenroll-cc-plugin`) see stale marketplace references that produce a reload error until the old entry is removed.

## What Went Wrong
- The marketplace identifier is effectively a public install contract, but it was treated as internal metadata.
- `llmdoc/reference/repo-surfaces.md` listed `.claude-plugin/plugin.json` but omitted `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`, so the rename had no stable-doc source of truth.
- Public READMEs absorbed the compatibility instructions, but llmdoc internal docs did not record that the identifier itself is stable and user-facing.

## Root Cause
- The plugin metadata surface was split across Codex (`.agents/plugins/marketplace.json`) and Claude (`.claude-plugin/marketplace.json`), and llmdoc reference docs tracked only the plugin manifests, not the marketplace manifests that publish the install name.

## Missing Docs or Signals
- No reference entry declaring the current marketplace identifier (`llmdoc-cc-plugin`) and the files that publish it.
- No routing hint that connects plugin install or reload-plugins failures to a marketplace-identifier mismatch.

## Promotion Candidates
- Add marketplace manifests and the current marketplace identifier to `llmdoc/reference/repo-surfaces.md` as stable surfaces.
- Keep the README compatibility note as the user-facing recovery path, and let `repo-surfaces.md` act as the internal source of truth for which identifier is currently canonical.

## Follow-up
- If the marketplace identifier changes again, update both marketplace manifests, the README compatibility note in English and Chinese, and `llmdoc/reference/repo-surfaces.md` in the same commit.
