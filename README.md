# llmdoc Claude Code Plugin

`llmdoc` workflow for Claude Code with a small public surface:

- Skill: `llmdoc`
- `/llmdoc:init` bootstraps `llmdoc/`
- `/llmdoc:update` writes reflection first, then updates stable docs

The default setup is simple:

- `CLAUDE.md` and `AGENTS.md` only need one short rule: step one is loading the `llmdoc` skill
- the skill entry is short, while detailed rationale, protocols, and templates are split under `skills/llmdoc/references/`
- the skill also defines proactive guide/reflection reading and proactive user discussion before non-trivial edits
- the skill also restores the good pattern of proactively asking whether to run `/llmdoc:update` at the end of non-trivial tasks
- agents and commands stay focused on execution instead of carrying a large amount of duplicated guidance

## Why This Version

The previous design exposed too many internal steps:

- separate skills for reading docs, investigating, and doc workflow
- separate `scout` and `investigator` agents with overlapping responsibilities
- heavy line-level references instead of file-level retrieval

This refactor keeps the public interface small and moves the rest into one reusable skill.

## Public Surface

- Skill: `llmdoc`
- Commands: `/llmdoc:init`, `/llmdoc:update`
- Codex CLI plugin support: `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`
- Codex CLI subagents: `.codex/agents/*.toml`
- Codex CLI hooks: `SessionStart`, `Stop` templates included

## Workflow

### `use`

`use` is not a command.

It is the operating mode defined by the `llmdoc` skill. The recommended setup is to tell the model to load that skill first, then follow it.

### `/llmdoc:init`

Use `/llmdoc:init` to create or repair the llmdoc skeleton and generate initial docs.

The command:

1. Inspects the repo
2. Creates the llmdoc directory structure
3. Runs temporary investigation scratch work
4. Generates initial MUST, overview, architecture, and reference docs
5. Synchronizes `llmdoc/index.md`

### `/llmdoc:update`

Use `/llmdoc:update` after meaningful work when project knowledge should be persisted.

The command:

1. Rebuilds context from llmdoc and the current working tree
2. Proactively reads relevant guides and reflections
3. Investigates impacted concepts
4. Writes a reflection under `llmdoc/memory/reflections/`
5. Updates stable docs
6. Synchronizes `llmdoc/index.md`

In normal use, the main assistant should proactively ask whether to run `/llmdoc:update` when the task produced durable knowledge or a useful reflection.

## llmdoc Layout

```text
llmdoc/
├── index.md
├── startup.md
├── must/                 # Small startup context package
├── overview/             # Project and feature identity
├── architecture/         # Retrieval maps, invariants, ownership
├── guides/               # One workflow per document
├── reference/            # Stable lookup facts and conventions
└── memory/
    ├── reflections/      # Post-task reflections
    ├── decisions/        # Durable process or design decisions
    └── doc-gaps.md       # Known documentation weaknesses

.llmdoc-tmp/
└── investigations/       # Temporary scratch investigation reports
```

`llmdoc/index.md` is the global doc map.
`llmdoc/startup.md` is only the startup reading order.
They should link to each other, but they should not repeat the same content.

## Internal Agents

| Agent | Purpose |
|------|---------|
| `investigator` | Evidence gathering for chat or temporary scratch reports |
| `worker` | Executes well-defined tasks |
| `recorder` | Maintains stable llmdoc documents |
| `reflector` | Writes post-task reflections |

## Installation

```bash
/plugin marketplace add https://github.com/TokenRollAI/cc-plugin
/plugin install llmdoc@cc-plugin
```

Copy [`CLAUDE.example.md`](CLAUDE.example.md) into `~/.claude/CLAUDE.md`.

If you want repository-local instructions, adapt [`AGENTS.example.md`](AGENTS.example.md) into the project root.

The reusable skill lives at [`skills/llmdoc/SKILL.md`](skills/llmdoc/SKILL.md).
Detailed references live under [`skills/llmdoc/references/`](skills/llmdoc/references/).
Codex CLI hook templates live under [`skills/llmdoc/templates/`](skills/llmdoc/templates/).

## Codex CLI

This repository now includes Codex CLI plugin metadata:

- [`.codex-plugin/plugin.json`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex-plugin/plugin.json)
- [`.agents/plugins/marketplace.json`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.agents/plugins/marketplace.json)

This follows the OpenAI Codex plugin docs:

- plugin manifest at `.codex-plugin/plugin.json`
- repo marketplace at `.agents/plugins/marketplace.json`

For repo-local testing in Codex:

1. Open the repo in Codex.
2. Ensure the repo marketplace file is present.
3. Restart Codex so the local marketplace is reloaded.

The current hook templates target the official Codex events documented today: `SessionStart` and `Stop`.

## Codex Subagents

This repository now also includes project-scoped Codex custom agents:

- [`.codex/config.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/config.toml)
- [`.codex/agents/llmdoc-investigator.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents/llmdoc-investigator.toml)
- [`.codex/agents/llmdoc-worker.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents/llmdoc-worker.toml)
- [`.codex/agents/llmdoc-recorder.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents/llmdoc-recorder.toml)
- [`.codex/agents/llmdoc-reflector.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents/llmdoc-reflector.toml)

These follow the Codex subagent docs pattern for project-scoped standalone TOML files under `.codex/agents/`.

The names are intentionally prefixed with `llmdoc_` so they do not override Codex built-in agents like `worker` or `explorer`.

## Migration Notes

This version removes the old fragmented skills and replaces them with one skill:

- active skill: `llmdoc`
- removed skills: `read-doc`, `investigate`, `update-doc`, `doc-workflow`, `deep-dive`, `commit`
- removed commands: `initDoc`, `withScout`, `what`
- removed agent: `scout`

If you used those before:

- use `/llmdoc:init` instead of the old `tr`-prefixed init command
- use `/llmdoc:update` instead of `/update-doc`
- load the `llmdoc` skill instead of using separate read/investigate skills
