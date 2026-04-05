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
- Let the skill carry the proactive guide/reflection reading protocol and the proactive user-discussion protocol
