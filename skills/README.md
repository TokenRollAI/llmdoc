Public surface:

- Skill: `llmdoc`
- Commands: `/llmdoc:init`, `/llmdoc:update`

Recommended setup:

- Put one short rule in `CLAUDE.md` and `AGENTS.md`: step one is loading the `llmdoc` skill
- Keep the entry rule in `skills/llmdoc/SKILL.md`
- Keep the detailed working model in `skills/llmdoc/references/`
- Keep reusable Codex hook and script templates in `skills/llmdoc/templates/`
- Let the skill carry the proactive guide/reflection reading protocol and the proactive user-discussion protocol
