Public surface:

- Core skill: `llmdoc`
- Claude Code commands: `/llmdoc:init`, `/llmdoc:update`
- Codex helper skills: `llmdoc-init`, `llmdoc-update`

Recommended setup:

- Put one short rule in `CLAUDE.md` and `AGENTS.md`: step one is loading the `llmdoc` skill
- Keep the entry rule in `skills/llmdoc/SKILL.md`
- Keep Codex-native command-like entry skills in `skills/llmdoc-init/` and `skills/llmdoc-update/`
- Keep the detailed working model in `skills/llmdoc/references/`
- Keep reusable Codex hook and script templates in `skills/llmdoc/templates/`
- Treat startup as a one-time cold-start package and context compaction as warm re-entry through `LLMDOC_STATE`
- Keep the startup pack bounded; use L0 root routing plus subsystem indexes in monoliths
- Let the skill carry the proactive guide/reflection reading protocol and the proactive user-discussion protocol
- Keep `/llmdoc:update` behavior aligned across Claude Code commands, Codex helper skills, public README files, and project-scoped agents
- Treat `.llmdoc-tmp/` as a local temporary context cache, not stable project memory
