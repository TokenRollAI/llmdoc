# llmdoc for Antigravity

Use llmdoc to find the design decisions and engineering constraints behind a change. It keeps that knowledge in the repository so later sessions can retrieve it. You need Git and Node.js 18 or newer with npm.

## Get started

Install the plugin from GitHub and check that Antigravity lists it as enabled.

```sh
agy plugin install https://github.com/TokenRollAI/llmdoc/tree/main/plugins/antigravity
agy plugin list
```

For a local checkout, run `agy plugin install ./plugins/antigravity` from the repository root.

Open a session at the root of your project. Run `/init` to create its knowledge base. In an existing project, ask “Use llmdoc to find which design decisions this change affects.” Run `/update` to review those decisions against the code. Use `/prune` to consolidate documentation or explicitly invoke `/upgrade` to migrate a V2 repository.

The plugin includes three roles. The investigator collects evidence, the reflector captures lessons for review, and the recorder maintains the repository’s knowledge.

## Session hooks

At session start, the plugin checks the workspace path supplied by Antigravity. When it contains `llmdoc/`, the hook uses npm to run the published `@tokenroll/llmdoc` CLI and inject its startup guidance and configured documents into the session. Other projects skip the runtime lookup. If the runtime fails, the session continues with a short diagnostic.

Antigravity has no PreCompact event. Its Stop hook can force another agent turn, but cannot deliver a passive reminder. This plugin registers only SessionStart. Use `/update` when changes are ready for review.
