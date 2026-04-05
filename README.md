# llmdoc for Claude Code and Codex

`llmdoc` is a doc-driven workflow for both Claude Code and Codex.

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
- Claude Code plugin support: `.claude-plugin/`
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
3. Runs multi-investigator temporary scratch work with explicit coverage checks, then a follow-up gap-check pass
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

## Install

### Claude Code

Install Claude Code first. Anthropic’s official docs currently list:

- `npm install -g @anthropic-ai/claude-code`
- or native install on macOS/Linux/WSL: `curl -fsSL https://claude.ai/install.sh | bash`

Official docs:

- https://docs.anthropic.com/en/docs/claude-code/quickstart
- https://docs.anthropic.com/en/docs/claude-code/setup

Then install this plugin marketplace and plugin:

```bash
/plugin marketplace add https://github.com/TokenRollAI/llmdoc
/plugin install llmdoc@llmdoc-cc-plugin
```

After installation:

1. Copy [`CLAUDE.example.md`](CLAUDE.example.md) into `~/.claude/CLAUDE.md`.
2. If you want repository-local instructions, adapt [`AGENTS.example.md`](AGENTS.example.md) into the project root.
3. Restart Claude Code so the new prompt and plugin state are loaded.

### Codex CLI

Install Codex CLI first. OpenAI’s official docs currently list:

```bash
npm i -g @openai/codex
codex
```

Official docs:

- https://developers.openai.com/codex/cli
- https://developers.openai.com/codex/plugins
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/hooks

This repository already contains the Codex-side integration files:

- [`.codex-plugin/plugin.json`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex-plugin/plugin.json)
- [`.agents/plugins/marketplace.json`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.agents/plugins/marketplace.json)
- [`.codex/config.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/config.toml)
- [`.codex/agents/`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents)
- [skills/llmdoc/templates/codex-hooks.json](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/skills/llmdoc/templates/codex-hooks.json)

For repo-local use in Codex:

1. Open this repository in Codex.
2. Ensure the repo marketplace file exists at `.agents/plugins/marketplace.json`.
3. Restart Codex so the marketplace and project-scoped agents are reloaded.
4. Optionally copy the hook template into `.codex/hooks.json` and adjust script paths if needed.

## Repo Files

The reusable skill lives at [`skills/llmdoc/SKILL.md`](skills/llmdoc/SKILL.md).
Detailed references live under [`skills/llmdoc/references/`](skills/llmdoc/references/).
Codex hook templates live under [`skills/llmdoc/templates/`](skills/llmdoc/templates/).

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
