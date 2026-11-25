---
name: llmdoc-dev-sync
description: >-
  Repository-local maintainer checklist for developing TokenRollAI/llmdoc
  itself. Use whenever modifying the CLI, config/output schemas, hooks, or
  published skills/agents so every user-facing capability stays discoverable
  across Claude, Codex, and Antigravity surfaces, passes prompt budgets, and stays isolated
  from internal dev tooling.
---

# llmdoc Repo Change-Set Sync

This skill governs development **inside the `TokenRollAI/llmdoc` repository**. It is intentionally kept outside `skills/` and `.agents/skills/` so it is never packaged into the published user plugin.

## Why this exists

Changing the CLI or adding details to `references/*.md` is not enough for agents to use a new capability. Under progressive disclosure, an agent first sees only skill `description`s, then loads a skill body, and only later opens a reference. If top-level routing, subagent contracts, or verification steps lag behind the CLI, agents will ignore or misuse the feature.

## Checklist on any CLI, schema, hook, or prompt change

1. **Audit cold-start agent discoverability (not just reference prose)**
   - **Skill discovery (`description`)**: Can an agent seeing only the frontmatter `name` + `description` of `skills/*/SKILL.md` tell when to activate the skill for the new capability (e.g., configuring `llmdoc.config.json`, mounting external `@source/` repos, refreshing caches)?
   - **Top-level routing (`skills/llmdoc/SKILL.md`)**: Do the Retrieval Gate table and Operating Rules expose new flags/syntax and route cleanly to the right `references/*.md` file?
   - **Workflow skills & subagents**: Check `skills/{init,update,prune,upgrade}/SKILL.md` and `agents/{investigator,recorder,reflector}.md` for changed read/write boundaries, failure semantics, or verification steps (for example, external `@source/` read-only rules or `status --refresh` before `validate`).
   - **Reference verification step**: When a config or command change cannot be fully verified by `validate` alone (such as network-free `validate` on a fresh `git` source), spell out the concrete verification sequence in the reference.

2. **Mirror the Claude authoring surface to Codex and Antigravity**
   - Edit Claude files as the source of truth: `skills/**` and `agents/*.md`.
   - Mirror the exact instruction bodies to Codex: `.agents/skills/**` and `.codex/agents/*.toml` (preserving host-specific frontmatter / TOML metadata).
   - Run `npm run sync:antigravity` to regenerate the five skills and their references, the three native agent definitions, the logo, and the manifest version in `plugins/antigravity/`. Review the host-specific SessionStart adapter when lifecycle behavior changes.
   - **Isolation boundary**: Never put repo-maintainer skills in `skills/`, `.agents/skills/`, or `plugins/antigravity/skills/`. These directories ship to plugin users. Repo-local dev skills belong in `.agent/skills/` and `.claude/skills/`.

3. **Run all mechanical gates before finishing**
   - `npm run typecheck && npm run lint && npm test`
   - `npm run validate:dogfood`
   - `node scripts/check-codex-surface.mjs` (enforces Claude/Codex parity, required routes, manifests, and version alignment)
   - `npm run check:antigravity` (checks generated files, manifest, startup behavior, and native strict validation when agy is available)
   - `npm run check:prompts` (enforces token ceilings: `llmdoc` ≤ 1600, workflow skills ≤ 2000, hooks ≤ 300, plus real launcher smoke checks)
   - If `cli/schemas/config.schema.json` changed, confirm `website/src/pages/schemas/config.schema.json.ts` stays in sync (`npm --prefix website run build && npm --prefix website run check:schema` when Node ≥ 22.12 is active).

4. **Pre-PR version & dogfood knowledge sync**
   - Before opening/updating a PR that changes published CLI or plugin behavior, bump all version surfaces per `AGENTS.md` (`package.json`, `cli/package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `plugins/antigravity/plugin.json`, plus root and `cli/` lockfiles).
   - Once code and tests settle, sync the repository's own `llmdoc/` docs via `/llmdoc:update`.
