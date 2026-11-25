# 项目协作约定

## 版本同步

- 修改已发布的 CLI 或插件行为（包括 skills、agents、hooks）时，提交 PR 前必须同步升级版本号；仅修改项目协作说明或文档时无需升级。
- 按变更影响选择版本；同一个 PR 已包含对应版本升级时，后续补充提交无需重复升级。
- 保持 `package.json`、`cli/package.json`、`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json` 的插件版本与 `.codex-plugin/plugin.json` 一致，并同步根目录及 `cli/` 下的 `package-lock.json`，包括根 lockfile 中的本地 CLI 条目。
- Claude 配置是手工维护的真相源；Codex 配置在临时目录重新生成后同步，保留宿主特有配置。
- 提交前运行 `node scripts/check-codex-surface.mjs`，并核对 lockfile 版本；不能只改 skill 或源码而遗漏发布版本。

## 变更集与 Skill 同步

- 修改 CLI 命令、配置/输出 schema、hook 或发布插件行为时，必须按本仓库维护 skill [`.agent/skills/llmdoc-dev-sync/SKILL.md`](.agent/skills/llmdoc-dev-sync/SKILL.md) 同步检查 `skills/`、`agents/` 及其 Codex 镜像（含 frontmatter `description` 触发面、按需 reference 和 `npm run check:prompts` 预算）。
- 仓库内部开发维护用 skill 放在 `.agent/skills/` 与 `.claude/skills/`，绝不放入对外发布的 `skills/` 或 `.agents/skills/`。
