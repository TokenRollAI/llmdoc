# Claude → Codex parity checklist

Claude Code 根插件是唯一手工维护的准源。Codex 表面由 ACPlugin 转换后，发布前逐项检查：

- [ ] `.claude-plugin/plugin.json`、`.codex-plugin/plugin.json` 与 `cli/package.json` 版本一致。
- [ ] `.claude-plugin/marketplace.json` 与 `.agents/plugins/marketplace.json` 的 marketplace 名均为 `llmdoc-plugin`，其中的插件名均为 `llmdoc`。
- [ ] Claude 表面只有五个 skills：`llmdoc`（operating）与 `init`、`update`、`prune`、`upgrade` 四个显式工作流（`skills/*/SKILL.md`，不再有 `commands/` 目录）；Codex 有对应 skills。
- [ ] 两个平台只暴露 `investigator` 与 `recorder` 两个角色契约。
- [ ] Codex 的 `.agents/skills/llmdoc/SKILL.md` 包含 Claude operating skill 的完整正文。
- [ ] `init/update/prune/upgrade` 的授权边界、前置 clean 检查、失败回滚和五态结果契约未在转换中丢失。
- [ ] `upgrade` 在两个平台都保持仅显式调用（Claude 侧 `disable-model-invocation: true`；Codex 侧 `policy.allow_implicit_invocation: false`），未被 operating skill 或 hook 隐式触发。
- [ ] Claude 的 `SessionStart`、`Stop`、`PreCompact` 都通过 `npx -y @tokenroll/llmdoc` 调用 scoped CLI；Codex 保留仓库根 `hooks/hooks.json`，并按官方信任模型启用。
- [ ] hooks fail-open、永不写 `llmdoc/`；SessionStart 不超过 200 token，Stop/PreCompact 成功时输出合法 JSON。
- [ ] 生成目录中没有 V2 `worker`、`reflector`、startup pack、watermark 或旧命令残留。
- [ ] `.agents/skills/cmd-upgrade/agents/openai.yaml` 设置 `policy.allow_implicit_invocation: false`，确保 upgrade 只能显式调用。
- [ ] 按本清单完成抽验，Codex plugin scanner 与完整 CI 均通过。

ACPlugin 只负责格式转换；它不会可靠删除上次生成留下的陈旧文件。转换应在临时副本中运行，再按生成目录做替换式同步。
