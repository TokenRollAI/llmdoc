# llmdoc

[Website](https://llmdoc.tokenroll.ai/) · [简体中文](README.zh-CN.md)

Persistent engineering context that helps coding agents understand a repository
without rediscovering its architecture every session.

- Preserve decisions, constraints, and cross-module contracts that source code
  does not explain cheaply.
- Retrieve only the context a task needs, then verify exact facts against the
  live repository.
- Recheck knowledge semantically as code evolves instead of accumulating stale
  implementation notes.

## Start in 60 seconds

You need Node.js 18 or newer and a Git repository. Choose the path that matches
your repository and agent.

### New repository with Claude Code

Add the marketplace and install the plugin:

```text
/plugin marketplace add TokenRollAI/llmdoc
/plugin install llmdoc@llmdoc-plugin
```

If the install summary says `Run /reload-plugins to activate.`, run that
command. If the reload warns about rereading the conversation, rerun it as
`/reload-plugins --force`. Once the plugin is active, initialize the repository:

```text
/llmdoc:init
```

### New repository with Codex

Add the marketplace and start Codex from the repository:

```bash
codex plugin marketplace add TokenRollAI/llmdoc
codex
```

Inside Codex, run `/plugins`, open the `llmdoc-plugin` marketplace, and install
`llmdoc`. Review the plugin and its hooks before enabling them. Then start a new
Codex session in the repository and ask:

```text
Use the llmdoc:init skill to initialize this repository.
```

### Antigravity (`agy` CLI / App / IDE)

Install the plugin from GitHub and check that it appears in the plugin list.

```sh
agy plugin install https://github.com/TokenRollAI/llmdoc/tree/main/plugins/antigravity
agy plugin list
```

For a local checkout, run `agy plugin install ./plugins/antigravity` from the repository root.
Open your project and run `/init` to create its knowledge base. When a workspace already
contains `llmdoc/`, SessionStart loads its context automatically. Ask the `llmdoc` skill
about a design decision, or run `/update` to review recent changes.
[Antigravity plugin guide](https://antigravity.google/docs/plugins)

### Repository that already has `llmdoc/`

Open its knowledge map immediately—no plugin is required for direct CLI use:

```bash
npx -y @tokenroll/llmdoc tree
npx -y @tokenroll/llmdoc search "revision"
```

`@tokenroll/llmdoc` is external tooling. Do not add it to the consumer project's
`package.json` or lockfile, and never use the unrelated bare package name
`npx llmdoc`. For reproducible runs, pin the package spec:
`npx -y @tokenroll/llmdoc@<version> <command>`. The package exposes the `llmdoc`
bin; the scoped npx form keeps it outside the consumer repository.

## How it works

```mermaid
flowchart LR
    K[Stable knowledge in llmdoc/] --> R[Task-scoped retrieval]
    R --> S[Source verification]
    S --> U[Semantic maintenance]
    U --> K
```

`llmdoc/` stores durable engineering meaning—not a copy of the repository. An
agent first retrieves the smallest useful knowledge set, uses source and tests
for current facts, and later verifies affected knowledge. A code change creates
a review obligation; it does not automatically create a documentation rewrite.

## Two operating layers

- **Agent workflows** own judgment and safe closeout. Invoke them through the
  host's command or skill interface.
- **Runtime CLI** owns retrieval and deterministic mechanics. Call it with the
  scoped npx command, directly or from a workflow.

The workflows are not four equivalent CLI commands:

- `init` creates a small, high-value V3 knowledge surface when none exists.
- `update` semantically verifies affected knowledge; unchanged documents can be
  recorded as verified without inventing prose changes.
- `prune` reduces duplicate, fragmented, or cheaply reconstructable knowledge;
  the CLI only supplies a read-only report.
- `upgrade` migrates legacy/V2 knowledge. It runs only when the user explicitly
  asks for it and must never be suggested or folded into another workflow.

Every explicit workflow reports exactly one result state: `success`,
`no_change`, `dry_run`, `incomplete`, or `failed`.

## Daily use

Apply this routing gate before broad exploration and again when entering a new
subsystem:

- Concept, contract, term, or “where is X?” → `search <query>`
- Context for concrete source files → `context --files <path...>`
- Cold start or unclear scope → `tree`
- Known topic or kind → `index --topic <topic>` / `index --kind <kind>`
- Bodies already identified → `show <path...>`

These are alternatives, not a fixed sequence. Once llmdoc narrows the working
set, use native tools for exact source text, line numbers, test behavior,
counts, and Git state.

`context --files` evaluates every input independently and reports
`unmappedFiles`; a non-empty impacted set never hides unmapped siblings.

Plugin lifecycle hooks invoke the same scoped CLI through an npm package alias.
This prevents a same-name local or `file:` dependency without a built bin from
shadowing the hook runtime; normal interactive commands keep the shorter form.

```bash
# Map the knowledge surface
npx -y @tokenroll/llmdoc tree --docs

# Find relevant knowledge
npx -y @tokenroll/llmdoc search "revision" --limit 5
npx -y @tokenroll/llmdoc context --files cli/src/cli.ts

# Read only the selected bodies
npx -y @tokenroll/llmdoc show architecture.mdx cli-runtime/retrieval-and-mutation.mdx

# Browse the knowledge surface locally
npx -y @tokenroll/llmdoc serve
```

Use `npx -y @tokenroll/llmdoc --help` or
`npx -y @tokenroll/llmdoc help <command>` for the complete, current CLI
reference. `status` and `delta` assess validity and impact; they are not
retrieval steps.

### Startup context configuration

Repositories that use the lifecycle hooks can add an optional
`llmdoc.config.json` at the llmdoc workspace root. In a Git repository, this is
the nearest Git root that owns `llmdoc/`:

```json
{
  "$schema": "https://llmdoc.tokenroll.ai/schemas/config.schema.json",
  "schema": "llmdoc.config/v1",
  "startup": {
    "remindSkill": true,
    "preload": [
      "architecture.mdx",
      "plugin-packaging/claude-and-codex.mdx"
    ]
  }
}
```

- `remindSkill` controls the SessionStart operating guidance: load the llmdoc
  skill, use the CLI retrieval gate, and delegate to the llmdoc roles. It
  defaults to `true`; set it to `false` to opt out.
- `preload` lists exact document IDs, with an optional `llmdoc/` prefix. Cold
  SessionStart inserts their bodies directly in the listed order with no llmdoc
  character or token budget. A final completion marker confirms that the host
  supplied the full preload; without it, retrieve only the missing body with
  `show`.
- Compact re-entry lists configured document IDs but does not inject their full
  bodies again. Continue from `LLMDOC_STATE` and retrieve a body only if needed.
- `validate` reports malformed config, missing paths, and path escapes.
  Normalized aliases of the same document are deduplicated with a warning.
  Lifecycle hooks stay fail-open: unreadable schema/JSON uses the default
  reminder, while a valid `remindSkill` choice survives preload-only errors.
- `mv` rewrites matching preload paths transactionally. `prune --report` lists
  preload references that must be updated before a manual merge or deletion.

Without this file, SessionStart emits its state plus the default operating
guidance and does not preload documents.

All fixed CLI interface text is English, including help, diagnostics, hook
messages, and the local Viewer. Chinese queries and repository document content
remain fully supported and are returned unchanged.

## Knowledge and safety boundaries

- Stable knowledge belongs in tracked `llmdoc/`; investigations, caches, and
  reflection candidates belong in local `.llmdoc-tmp/`.
- V3 documents are pure Markdown `.mdx` with YAML front matter and optional
  `<CodeRef>` anchors. The path is the document ID, and `kind` lives in front
  matter rather than directory names.
- The tree contains root singleton documents and one level of topic folders. It
  has no `index.mdx` topic nodes and no nested topic folders.
- `llmdoc/meta.json` is a Git-revision validity ledger, not documentation. Dirty
  worktree state is an additional signal, not a second truth system. Never
  hand-edit the ledger; use the CLI's guarded mutation and commit operations.
- Within agent workflows, `investigator` gathers temporary evidence, `reflector`
  captures privacy-safe lesson candidates, and `recorder` is the only role that
  writes tracked knowledge.
- Every workflow authorizes knowledge maintenance only, not source-code edits.
  Structural writes are validated and confined to the repository's `llmdoc/`
  boundary.
- Hooks emit read-only, fail-open signals through the scoped CLI. SessionStart
  also injects the configurable operating guidance, so projects do not need to
  repeat it in CLAUDE.md/AGENTS.md. Review hooks and trust the plugin source
  before enabling them.
- A `delta` match means “review this claim,” not “rewrite this document.”
  Preserve decisions, rationale, boundaries, invariants, contracts, and
  non-obvious failure semantics; leave reconstructable facts in source, schemas,
  help, tests, or generated configuration.

## Platform integration

### Claude Code

The repository-root Claude plugin is the canonical authored surface. It provides
the operating skill, four explicit workflows, three roles, and lifecycle hooks.
Use the installation flow above, or manage it from Claude Code's plugin UI. See
the [Claude Code plugin documentation](https://code.claude.com/docs/en/discover-plugins)
for current installation behavior.

### Codex

The Codex plugin is generated from the Claude surface and exposes equivalent
skills, roles, and hooks. You can also run `/plugins` in Codex CLI to browse the
Plugins Directory. Start a new session after installation, and inspect
third-party hooks before trusting them. Codex IDE extensions do not currently
support plugins. See the
[official Codex plugin documentation](https://developers.openai.com/codex/plugins)
for current installation behavior.

### Other agents

Agents without a native plugin system can use the same runtime and operating
contract. Copy the portable
[`AGENTS.md` integration recipe](docs/agent-integration.md) into the consumer
repository.

## Develop this repository

The repository root is a private development workspace; the public consumer
artifact is the `@tokenroll/llmdoc` CLI. Claude skills and agents are canonical,
and the Codex and Antigravity plugins mirror their instructions.

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:dogfood
npm run check:prompts
npm run check:antigravity
```

Install from the repository root so the local `llmdoc` bin is linked before
validation. Changes to CLI semantics must remain synchronized with all three host
surfaces, the bilingual READMEs, design documentation, and dogfood knowledge.

## Reference

- [Portable Agent integration recipe](docs/agent-integration.md)
- [V3 design notes](docs/v3-design/README.md) (currently marked draft)
- [Operating protocol](skills/llmdoc/SKILL.md)
- Workflow contracts: [`init`](skills/init/SKILL.md),
  [`update`](skills/update/SKILL.md), [`prune`](skills/prune/SKILL.md), and
  [`upgrade`](skills/upgrade/SKILL.md)
- Runtime reference: `npx -y @tokenroll/llmdoc --help`

## Project support

<table>
<tbody>
<tr>
<td align="center">
<a href="https://linux.do"><img src="./docs/assets/linux-do.png" alt="LINUX DO" width="120"></a>
<br><sub>Community support</sub>
</td>
</tr>
</tbody>
</table>
