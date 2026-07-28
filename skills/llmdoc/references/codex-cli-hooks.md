# Codex CLI Hooks

This repository explicitly supports Codex CLI hooks for:

- lifecycle-aware `SessionStart`
- an optional `Stop` template

Why these two first:

- low risk compared with tool-blocking hooks
- useful for reinforcing llmdoc behavior at session boundaries
- they do not require deep control over the tool loop

## Recommended use

### `SessionStart`

Use separate matchers for each lifecycle source:

- `startup|clear`: cold start; load the skill and startup pack once
- `resume`: reuse a valid `LLMDOC_STATE`, otherwise cold start
- `compact`: warm re-entry; do not replay the skill or startup pack

The compact branch should inject only the current startup-pack fingerprint, byte size, and targeted invalidation rules. A compact event alone is not evidence that project knowledge changed.

The provided script fingerprints `llmdoc/index.md`, `llmdoc/startup.md`, and files under `llmdoc/must/`. It also reports their combined UTF-8 byte size against `LLMDOC_STARTUP_MAX_BYTES` (24 KiB by default).

### Compact summary state

`templates/compact-prompt.md` is an optional compaction-prompt override that preserves a structured `LLMDOC_STATE`. It stores paths and distilled task facts, not full document bodies.

Use the lifecycle hook even without the override: it fixes the deterministic reload caused by treating `compact` as cold start. Use the prompt template when stronger summary-shape guarantees justify overriding Codex's built-in compaction prompt. Keep the override reviewed as Codex evolves; do not enable it automatically.

To opt in, copy the template to a stable project path and point project `.codex/config.toml` at it:

```toml
experimental_compact_prompt_file = ".codex/llmdoc-compact-prompt.md"
```

The file-backed key is experimental. Remove the setting to return to Codex's built-in prompt.

### `Stop`

Use it for end-of-turn review or lightweight cleanup. Treat it as a best-effort reminder, not as the precise memory archive checkpoint.

Good uses:

- append a stop-hook record into `.llmdoc-tmp/`
- show a lightweight UI reminder after a turn ends
- capture raw hook payloads for troubleshooting
- remind the assistant that active memory may need archiving

Do not expect `Stop` to replace end-of-task prompting inside the assistant. It runs at turn scope, not task scope.

Do not rely on `Stop` to enforce the `lessons-learned.md` threshold exactly. `/llmdoc:update` must perform the exact active-memory count after any new reflection is written, because hook timing can miss boundary cases.

## Configuration

Codex hooks are configured in `hooks.json` files such as:

- `~/.codex/hooks.json`
- `<repo>/.codex/hooks.json`

The official hooks reference says `SessionStart` can add context through `hookSpecificOutput.additionalContext`. `Stop` can show `systemMessage` feedback or continue a turn with a blocking decision; the provided optional template only logs and shows a reminder.

Recommended template files in this skill:

- `templates/codex-hooks.json`
- `templates/session-start.sh`
- `templates/stop.sh`
- `templates/compact-prompt.md`

After changing lifecycle behavior, run `scripts/verify-lifecycle-hooks.sh <project-root>` to verify separated matchers, stable fingerprints, and the absence of cold-start instructions in compact output.

The Codex plugin also ships `hooks/hooks.json`, which uses default plugin hook discovery and `$PLUGIN_ROOT`. Installed plugin hooks require the normal Codex trust review. The bundled hook includes only `SessionStart`; the more opinionated `Stop` behavior remains opt-in.

## Security

Hooks run shell commands automatically.

Treat them as production-grade automation:

- prefer absolute paths
- quote shell variables
- review scripts before enabling them
- keep hook behavior lightweight and predictable

Official references:

- https://developers.openai.com/codex/plugins
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/hooks
- https://developers.openai.com/codex/config-reference
