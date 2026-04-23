# llmdoc for Claude Code and Codex

`llmdoc` is a doc-driven workflow for both Claude Code and Codex.

- Core skill: `llmdoc`
- Claude Code commands: `/llmdoc:init`, `/llmdoc:update`
- Codex helper skills: `llmdoc-init`, `llmdoc-update`

The default setup is simple:

- `CLAUDE.md` and `AGENTS.md` only need one short rule: step one is loading the `llmdoc` skill
- the core skill entry is short, while detailed rationale, protocols, and templates are split under `skills/llmdoc/references/`
- the core skill defines proactive guide/reflection reading and proactive user discussion before non-trivial edits
- the workflow restores the good pattern of proactively asking whether to run `/llmdoc:update` at the end of non-trivial tasks
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
3. Runs a short pre-investigation user calibration; pressing Enter with no extra reply continues with repository evidence
4. Runs size-aware, theme-driven multi-investigator temporary scratch work with explicit persistence checks, subagent-to-main-agent write fallback, and targeted follow-up passes instead of rerunning the whole repo
5. Shows a required post-investigation concept list so the user can generate docs now or add terms, emphasis, or conventions
6. Generates initial MUST, overview, architecture, and reference docs
7. Synchronizes `llmdoc/index.md`
8. Removes `.llmdoc-tmp/` after the stable docs are complete

Repository size is estimated from first-party source files and tests after excluding dependency, generated, cache, and VCS directories such as `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `vendor/`, and `.git/`. Lockfiles, generated artifacts, vendored code, and cache directories do not count toward the thresholds. The current size bands are: small `<= 1000 LOC`, medium `1001-5000 LOC`, large `> 5000 LOC`.

The first stable pass stays depth-first, but the core-doc target is now size-aware: small and medium repositories usually start with `2-3` deep architecture or reference docs, while large repositories can start with `3-5` when they have distinct invariant clusters worth documenting separately.

If an investigator can return a report but cannot write its scratch file, init now falls back to having the coordinating assistant persist the returned markdown to the same `.llmdoc-tmp/investigations/` path. Investigators also perform a best-effort sidecar write to `<output_path>.sidecar.md`, so that even if the tool-framework transport drops the return payload (for example `Tool result missing due to internal error`), the coordinating assistant can recover the report from disk without re-materializing the markdown through the model. A sidecar is only a recovery source: if `output_path` is missing but the sidecar is complete, the coordinating assistant copies the sidecar back to `output_path` and verifies the restored canonical file before continuing. It should ask the user for write authorization only if the coordinating assistant's own fallback write or restore copy also fails.

#### Investigator failure handling

Init tracks four investigator result states and applies a different recovery path for each:

| State | Trigger | Recovery |
|-------|---------|----------|
| `persisted` | Report written; `<!-- llmdoc:eor -->` sentinel present | Verify file and continue |
| `write_failed_fallback_ready` | Write failed; full markdown in return payload | Coordinating assistant writes to same path, verifies sentinel |
| `transport_failure` | Tool call returns internal error; no payload | Check `output_path`, then sidecar; if only the sidecar is complete, copy it back to `output_path`, verify, and rerun only if neither path is restorable |
| `context_overflow` | File present but sentinel missing (truncated) | Split brief into ≤3 narrower sub-briefs; route via follow-up slot |

Each investigator report ends with the sentinel `<!-- llmdoc:eor -->`. A file without the sentinel is treated as truncated (`context_overflow`), not complete. The sentinel lives only in `.llmdoc-tmp/investigations/` scratch files and is removed with the directory at the end of init.

Platform concurrency limits shape how recovery fan-out works:

- **Claude Code**: hard cap of 10 concurrent subagents; excess requests are queued automatically. Recovery sub-briefs can be sent concurrently within this cap.
- **Codex**: bounded by `max_threads` and `max_depth` in `.codex/config.toml`. Recovery sub-briefs must stay within remaining budget; prefer sequential when budget is tight.

Context overflow recovery does not rerun the same brief scope — that would overflow again. Instead, the topic is split and processed through the existing follow-up slot.

### `/llmdoc:update`

Use `/llmdoc:update` after meaningful work when project knowledge should be persisted.

In Claude Code, this is a command.
In Codex, use the helper skill `llmdoc-update` for the equivalent workflow.

The command:

1. Rebuilds context from llmdoc and the current working tree
2. Proactively reads relevant guides and reflections
3. Recreates `.llmdoc-tmp/investigations/` on demand and investigates impacted concepts with the same persistence checks and fallback recovery used by init when file-sink scratch reports are needed
4. Writes a reflection under `llmdoc/memory/reflections/`
5. Updates stable docs
6. Synchronizes `llmdoc/index.md`

If `/llmdoc:update` needs file-sink scratch work after a previous init cleaned up `.llmdoc-tmp/`, it recreates `.llmdoc-tmp/investigations/` before launching the investigation or writing fallback artifacts. If the coordinating assistant cannot create that directory, cannot write a fallback report, or cannot restore `output_path` from a valid sidecar, it must pause and ask the user for write authorization instead of silently stalling.

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

Compatibility note: if Claude Code still has an older cached marketplace entry such as `tokenroll-cc-plugin`, reset the marketplace and reload plugins with:

```bash
/plugin marketplace remove tokenroll-cc-plugin
/plugin marketplace add https://github.com/TokenRollAI/llmdoc
/plugin install llmdoc@llmdoc-cc-plugin
/reload-plugins
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

#### Option 1: Use this repository directly in Codex

Use this when you want to work inside this repository and keep the plugin local to the repo checkout.

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

#### Option 2: Install `llmdoc` as a personal local plugin

Use this when you want the `llmdoc` plugin to be available across repositories on your machine.

1. Copy this repository into `~/.codex/plugins/llmdoc`:

```bash
mkdir -p ~/.codex/plugins
cp -R /absolute/path/to/llmdoc ~/.codex/plugins/llmdoc
```

2. Add or update `~/.agents/plugins/marketplace.json` so it points at that plugin directory with a `./`-prefixed path relative to your home directory:

```json
{
  "name": "local-personal",
  "interface": {
    "displayName": "My Local Plugins"
  },
  "plugins": [
    {
      "name": "llmdoc",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/llmdoc"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

3. Restart Codex.
4. In Codex, run `/plugins`.
5. Find `llmdoc` in the plugin list, select it to open the detail page.
6. Install the plugin.
7. Start a new thread in any repository and either:
   - ask Codex to load the `llmdoc` skill first for normal work
   - choose `llmdoc-init` when you want the `/llmdoc:init` workflow
   - choose `llmdoc-update` when you want the `/llmdoc:update` workflow
   - or type `@` and choose the plugin or one of its bundled skills explicitly

This personal install gives you the plugin and its bundled skill across repositories. The files under [`.codex/agents/`](.codex/agents) and [`.codex/config.toml`](.codex/config.toml) in this repository are still project-scoped and only apply when you open this repository itself.

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
