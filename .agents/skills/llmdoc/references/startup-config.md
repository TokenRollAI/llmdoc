# llmdoc Configuration (Startup & External Sources)

Read this reference when a user asks to configure `llmdoc.config.json` or `llmdoc.config.local.json` (SessionStart guidance, external knowledge `sources`, or preload documents), or when a workflow creates, renames, merges, or deletes a document named in startup preload.

## File and schema

Place the optional tracked `llmdoc.config.json` at the llmdoc workspace root (the nearest Git root owning `llmdoc/`, or the directory owning `llmdoc/` without Git). `llmdoc commit` commits only `llmdoc/` and `llmdoc/meta.json`; commit `llmdoc.config.json` separately with Git.

- `llmdoc.config/v1`: supports `startup` (`remindSkill`, `preload`).
- `llmdoc.config/v2`: adds optional `sources` to mount external team knowledge repositories (`git`) or in-repository paths / submodules (`path`) as read-only `@<alias>/...` documents.

```json
{
  "$schema": "https://llmdoc.tokenroll.ai/schemas/config.schema.json",
  "schema": "llmdoc.config/v2",
  "sources": {
    "team": {
      "git": "git@github.com:acme/team-knowledge.git",
      "ref": "main",
      "dir": "conventions",
      "refresh": "24h"
    },
    "shared": {
      "path": "libs/shared-proto"
    }
  },
  "startup": {
    "remindSkill": true,
    "preload": [
      "architecture.mdx",
      "@team/service-baseline.md"
    ]
  }
}
```

- `startup.remindSkill` defaults to `true`. Set it to `false` only when the repository deliberately supplies equivalent operating guidance elsewhere or wants no proactive reminder.
- `startup.preload` accepts local `.mdx` document IDs (optional `llmdoc/` prefix) and, in `v2`, explicit `@<alias>/<path>` external source document IDs in declaration order.
- Cold SessionStart injects configured bodies directly (local bodies have no llmdoc budget; external bodies have a 128 KiB total safety cap). A final completion marker at the very end distinguishes a complete preload from host-side truncation (and indicates when external entries were skipped); retrieve any missing or skipped body with `show`.
- Compact re-entry lists configured document IDs without injecting the bodies again. Use the compacted `LLMDOC_STATE` first and retrieve a body only when needed.

## Local overrides (`llmdoc.config.local.json`)

For local multi-repo development (for example reading an unpushed sibling repository such as `../backend`), place a **gitignored** `llmdoc.config.local.json` next to `llmdoc.config.json` using the same `llmdoc.config/v2` schema:

```json
{
  "schema": "llmdoc.config/v2",
  "sources": {
    "backend": { "path": "../backend" }
  }
}
```

- Unlike tracked `llmdoc.config.json` (where `path` must remain inside the repository), `llmdoc.config.local.json` permits relative paths outside the repository (e.g. `../backend`) and absolute paths.
- Local `sources` merge on top of `llmdoc.config.json` (allowing you to add local-only sibling repos or temporarily override a tracked `git` source alias with a local checkout). `startup.preload` appends and deduplicates; `startup.remindSkill` overrides when specified.
- `llmdoc.config.local.json` works even when `llmdoc.config.json` does not exist, and is excluded from implementation-surface delta signals. Keep it in `.gitignore` (`validate` warns if it is tracked by Git).

## External sources (`v2`)

- Each `sources` entry uses either `git` (`ref`, `dir`, `refresh` defaulting to `24h`) or `path` (`dir`), never both. Source aliases match `^[a-z0-9][a-z0-9._-]{0,63}$`.
- If the mounted directory contains `llmdoc/`, that directory is the document root; otherwise the mounted directory itself is scanned recursively for `.md`/`.mdx` files with plain YAML front matter containing `description` (`kind` defaults to `reference`; files without front matter and source `meta.json` are ignored).
- Retrieval commands and network behavior:
  - `tree` / `tree --docs`: lists local docs and current source status without hitting the network.
  - `index --topic @<alias>` (or `@<alias>/<subdir>`): lists source metadata; cold-fetches the targeted git source if uncached.
  - `search <query> [--topic @<alias>]`: searches local and source docs (or a scoped source); cold-fetches missing git sources in scope.
  - `show @<alias>/<path>`: reads source bodies; cold-fetches only the requested source alias if uncached.
  - `context --files <path...>`: matches `path` source `code.paths` only inside that source's mounted subtree (after stripping the mount prefix), matches `git` source globs against consumer repo paths, follows `requires` into external sources, and never lets external hits suppress consumer `unmappedFiles`.
  - `status --refresh`: refreshes configured git sources in the foreground and exits non-zero if any refresh fails.
- Mutation commands (`new`, `adopt`, `mv`, `fingerprint`, `commit`) are strictly local and reject `@` targets.
- Local documents may list `@<alias>/<path>` in `relations.requires` (one-way only; source-internal `requires` stay within the same source). **Quote `@`-prefixed strings in YAML front matter** because `@` is a reserved YAML indicator:

```yaml
relations:
  requires:
    - "@team/service-baseline.md"
```

- Git sources are cached globally under `~/.llmdoc` (overridable via `LLMDOC_HOME`), with a shared mirror per URL and isolated read-only subtree snapshots per `(url, ref, dir)`. SessionStart and `status` read existing snapshots without blocking and trigger a bounded background refresh once `refresh` expires.
- Security: external sources are read-only reference material parsed with plain YAML only. For strict supply-chain pinning, lock `ref` to a full 40-character commit SHA (tags can still be moved on a remote); `status` and preload headers display the active commit revision.
- Submodule updates: to edit documentation inside a submodule, enter the submodule directory, create a branch (since `llmdoc commit` rejects detached HEAD), run the normal update/commit flow, open a PR there, then bump the gitlink in the parent repository.

## Validation and degradation

Run `validate` after creating or editing config files. Because `validate` never accesses the network, after adding or editing a `git` source run `status --refresh` (or `index --topic @<alias>`) followed by `validate` to confirm the remote ref, `dir`, and any `@<alias>/...` preload or `requires` targets resolve cleanly:

- Invalid JSON, invalid schema, unsupported newer schema versions, invalid source configs (including invalid git refs or out-of-repo tracked paths), or missing local preload entries are errors (hooks degrade fail-open while preserving valid `remindSkill` when schema is valid).
- Unavailable external sources (offline, uncached, uninitialized submodule) or missing external documents in `startup.preload` / `relations.requires` are warnings and never block local `commit`. Cold SessionStart skips only the unavailable external entries while still injecting available local and external documents.
- Entries that normalize to the same document are deduplicated with a warning.

## Structural changes

A preload entry is a persistent reference and must stay synchronized with document identity:

- `llmdoc mv` rewrites matching local preload entries in `llmdoc.config.json` transactionally with document references and the ledger (external `@...` entries are left untouched).
- Before a prune workflow manually merges or deletes documents, inspect the report's startup preload references and update or remove affected entries in the same write set.
- After any manual local path change, run `validate` before `commit`. A missing local preload target is an error and intentionally blocks finalization.

Do not create `llmdoc.config.json` during init unless the user or repository requirements call for non-default startup behavior, external sources, or deliberate document preload.
