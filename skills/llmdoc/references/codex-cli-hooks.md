# Codex CLI Hooks

This repository now explicitly supports Codex CLI hooks for:

- `SessionStart`
- `Stop`

Why these two first:

- low risk compared with tool-blocking hooks
- useful for reinforcing llmdoc behavior at session boundaries
- they do not require deep control over the tool loop

## Recommended use

### `SessionStart`

Use it to inject lightweight context at the start of a session.

Good uses:

- remind Codex to load the `llmdoc` skill
- remind Codex to read `llmdoc/index.md` and `llmdoc/startup.md`
- remind Codex to proactively read guides and reflections
- remind Codex to align with the user before non-trivial edits

### `Stop`

Use it for end-of-turn review or lightweight cleanup.

Good uses:

- append a stop-hook record into `.llmdoc-tmp/`
- add lightweight review context after a turn ends
- capture raw hook payloads for troubleshooting

Do not expect `Stop` to replace end-of-task prompting inside the assistant. It runs at turn scope, not task scope.

## Configuration

Codex hooks are configured in `hooks.json` files such as:

- `~/.codex/hooks.json`
- `<repo>/.codex/hooks.json`

The official hooks reference says `SessionStart` can add context through `hookSpecificOutput.additionalContext`, while `Stop` can continue a turn with review feedback.

Recommended template files in this skill:

- `templates/codex-hooks.json`
- `templates/session-start.sh`
- `templates/stop.sh`

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
