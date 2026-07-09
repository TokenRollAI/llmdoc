# llmdoc for Claude Code and Codex

[中文文档](README.zh-CN.md)

`llmdoc` is a doc-driven workflow for both Claude Code and Codex.

- Core skill: `llmdoc`
- Claude Code commands: `/llmdoc:init`, `/llmdoc:update`
- Codex helper skills: `llmdoc-init`, `llmdoc-update`

The default setup is simple:

- `CLAUDE.md` and `AGENTS.md` only need one short rule: step one is loading the `llmdoc` skill
- the core skill entry is short, while detailed rationale, protocols, and templates are split under `skills/llmdoc/references/`
- the core skill defines proactive guide/reflection reading and proactive user discussion before non-trivial edits
- the workflow restores the good pattern of proactively asking whether to run `/llmdoc:update` at the end of non-trivial tasks
- `/llmdoc:update` supports lightweight and heavier modes, so immediate post-task doc updates do not always require a full multi-agent pipeline
- helper Codex skills provide command-like entrypoints without pretending Codex has custom slash commands for this plugin
- agents and command contracts stay focused on execution instead of carrying a large amount of duplicated guidance

## Why This Version

The previous design exposed too many internal steps:

- separate skills for reading docs, investigating, and doc workflow
- separate `scout` and `investigator` agents with overlapping responsibilities
- heavy line-level references instead of file-level retrieval

This refactor keeps the public interface small and moves the rest into one reusable operating skill plus small Codex helper entry skills.

## Public Surface

- Core skill: `llmdoc`
- Claude Code commands: `/llmdoc:init`, `/llmdoc:update`
- Codex helper skills: `llmdoc-init`, `llmdoc-update`
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

In Claude Code, this is a command.
In Codex, use the helper skill `llmdoc-init` for the equivalent workflow.

The command:

1. Inspects the repo
2. Creates the llmdoc directory structure
3. Runs multi-investigator temporary scratch work with explicit coverage checks, then a follow-up gap-check pass
4. Generates initial MUST, overview, architecture, and reference docs
5. Synchronizes `llmdoc/index.md`

### `/llmdoc:update`

Use `/llmdoc:update` after meaningful work when project knowledge should be persisted.

In Claude Code, this is a command.
In Codex, use the helper skill `llmdoc-update` for the equivalent workflow.

The command keeps tracked `llmdoc/` docs consistent with the current repository. Stable docs should stay compact: either smaller than the source they describe or useful because they explain architecture, implementation intent, boundaries, and stable contracts.

Change detection is **commit-based**. A tracked watermark, `llmdoc/state/sync.md`, records the last source commit already reflected in `llmdoc/`. By default the command diffs `watermark..HEAD` (the net change across every commit since the last sync) and advances the watermark on success. Uncommitted working-tree changes are folded in as an additional input but never move the watermark.

It can ingest multiple commit batches in one run — `--range A..B` (repeatable), `--commits SHA,…`, `--since REF`, `--from SHA`, `--working-tree-only` — and degrades gracefully on non-git projects, shallow clones, a first run with no watermark, and rebased/orphaned watermarks.

The command selects the lightest mode that can keep docs correct, keyed on range size × authorship × risk:

- `fast`: a small, self-authored range with nameable impacted docs
- `analysis`: a larger range, any non-self-authored commit, or a recovered/first-run baseline — one focused evidence pass
- `full`: large or high-risk ranges, multi-batch backfill, or history-rewrite recovery — separate investigation, reflection, and recording

The command:

1. Reads the watermark and computes the commit range (plus any batch flags and the working tree)
2. Proactively reads relevant guides and reflections
3. Chooses an update mode from range size, authorship, and risk
4. Investigates impacted concepts only when the selected mode requires it
5. Writes a reflection under `llmdoc/memory/reflections/` only when there is a workflow lesson or missing-doc signal
6. Updates stable docs and reconciles `llmdoc/memory/doc-gaps.md`
7. Synchronizes `llmdoc/index.md` and advances the watermark on success

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

`.llmdoc-tmp/` is a local temporary context cache. Investigator reports can persist across nearby sessions and help avoid repeated research, but they are ignored by git, not indexed, and not a source of truth. Promote only durable conclusions into tracked `llmdoc/` docs.

## Internal Agents

| Agent | Purpose |
|------|---------|
| `investigator` | Evidence gathering for chat, current-state research, or temporary scratch reports |
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

This repository contains two separate Codex integration surfaces:

- Plugin packaging for `llmdoc` itself:
  - [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json)
  - [`skills/llmdoc/`](skills/llmdoc/)
  - [`skills/llmdoc-init/`](skills/llmdoc-init/)
  - [`skills/llmdoc-update/`](skills/llmdoc-update/)
  - [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) as a repo-scoped local marketplace example
- Repo-local Codex workflow files for this repository:
  - [`.codex/config.toml`](.codex/config.toml)
  - [`.codex/agents/`](.codex/agents)
  - [`skills/llmdoc/templates/codex-hooks.json`](skills/llmdoc/templates/codex-hooks.json)

#### Option 1: Install from GitHub (recommended)

Use this when you want the `llmdoc` plugin available across all repositories on your machine.

```bash
codex plugin marketplace add TokenRollAI/llmdoc
```

Then:

1. Restart Codex so the new marketplace source is loaded.
2. Run `/plugins` in Codex.
3. Find `llmdoc` in the plugin list, select it to open the detail page.
4. Install the plugin.
5. Start a new thread in any repository and either:
   - ask Codex to load the `llmdoc` skill first for normal work
   - choose `llmdoc-init` when you want the `/llmdoc:init` workflow
   - choose `llmdoc-update` when you want the `/llmdoc:update` workflow
   - or type `@` and choose the plugin or one of its bundled skills explicitly

#### Option 2: Use this repository directly (local development)

Use this when you are working inside this repository — contributing to `llmdoc` or testing local changes.

1. Open this repository in Codex.
2. Make sure [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) exists.
3. If Codex was already running, restart it so the repo marketplace and project-scoped agents are reloaded.
4. In Codex, run `/plugins`.
5. Find `llmdoc` in the plugin list, select it to open the detail page.
6. Install the plugin.
7. Start a new thread in this repository and either:
   - ask Codex to load the `llmdoc` skill first for normal work
   - choose `llmdoc-init` when you want the `/llmdoc:init` workflow
   - choose `llmdoc-update` when you want the `/llmdoc:update` workflow
   - or type `@` and choose the plugin or one of its bundled skills explicitly
8. If you want hooks, copy [`skills/llmdoc/templates/codex-hooks.json`](skills/llmdoc/templates/codex-hooks.json) to `.codex/hooks.json` and adjust the script paths for your machine.

When you open this repository itself, Codex can also use the project-scoped agents under [`.codex/agents/`](.codex/agents) and the agent limits from [`.codex/config.toml`](.codex/config.toml).

## Repo Files

The reusable skill lives at [`skills/llmdoc/SKILL.md`](skills/llmdoc/SKILL.md).
The Codex helper entry skills live at [`skills/llmdoc-init/SKILL.md`](skills/llmdoc-init/SKILL.md) and [`skills/llmdoc-update/SKILL.md`](skills/llmdoc-update/SKILL.md).
Detailed references live under [`skills/llmdoc/references/`](skills/llmdoc/references/).
Codex hook templates live under [`skills/llmdoc/templates/`](skills/llmdoc/templates/).

## Codex Subagents

This repository now also includes project-scoped Codex custom agents:

- [`.codex/config.toml`](.codex/config.toml)
- [`.codex/agents/llmdoc-investigator.toml`](.codex/agents/llmdoc-investigator.toml)
- [`.codex/agents/llmdoc-worker.toml`](.codex/agents/llmdoc-worker.toml)
- [`.codex/agents/llmdoc-recorder.toml`](.codex/agents/llmdoc-recorder.toml)
- [`.codex/agents/llmdoc-reflector.toml`](.codex/agents/llmdoc-reflector.toml)

These follow the Codex subagent docs pattern for project-scoped standalone TOML files under `.codex/agents/`, so they apply when you open this repository in Codex.

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
