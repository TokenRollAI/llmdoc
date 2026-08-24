# 05. 仓库布局与平台封装

## 1. 目标仓库结构:仓库根即标准 Claude Code plugin

不把插件藏进 `plugins/` 子目录——**仓库根本身保持标准 Claude Code plugin 形态**(与 V2 现状一致):`/plugin install`、marketplace 引用、裸 GitHub 安装都按根目录预期工作,不需要任何间接层。

```text
llmdoc-repository/                  # 根 = 标准 Claude Code plugin
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/
│   ├── llmdoc/SKILL.md             # operating skill:渐进读取协议 + LLMDOC_STATE
│   ├── init/SKILL.md               # 显式工作流(即斜杠命令 /llmdoc:init)
│   ├── update/SKILL.md
│   ├── prune/SKILL.md
│   └── upgrade/SKILL.md            # disable-model-invocation: true,仅显式调用
├── agents/                         # investigator.md / recorder.md(角色契约)
├── hooks/
│   └── hooks.json                  # SessionStart/Stop/PreCompact → npx @tokenroll/llmdoc hook *
├── cli/                            # npm 包 @tokenroll/llmdoc,暴露 bin llmdoc(Runtime 实体)
│   ├── src/
│   ├── schemas/                    # front matter / meta.json 的 JSON Schema(事实源)
│   ├── templates/                  # new/init 脚手架模板
│   └── package.json
├── .codex-plugin/                  # ACPlugin 生成的 Codex manifest
├── .agents/skills/                 # ACPlugin 生成的 operating/command skills
├── .codex/agents/                  # ACPlugin 生成的两个 project-scoped agent 契约
├── docs/
│   └── v3-design/                  # 本设计
├── llmdoc/                         # 本仓库自身的 V3 dogfood 知识
├── tests/
└── .github/workflows/
```

原则:

- **Claude 插件文件(skills/agents/hooks)就是业务 prompt 的 canonical source**,只手工维护这一份;不另设 `prompts/` 目录造成双份;
- **不设 `commands/` 目录**:Claude Code 已把 command 合并进 skill(`skills/<name>/SKILL.md` 同样生成 `/llmdoc:<name>` 斜杠命令,且支持 `disable-model-invocation` 与 `$ARGUMENTS`),四个显式工作流与 operating skill 统一放在 `skills/`,也让 Codex 侧的 skill 转换接近一比一;
- prompt 文件是薄壳:只含判断性 SOP 与"调哪个 CLI 命令",机械逻辑(diff、校验、检索、hook 信号)全部在 `cli/`;
- upgrade 的迁移正文只活在 `skills/upgrade/SKILL.md`(`disable-model-invocation: true`),正常任务上下文零出现;
- V2 遗留的 worker/reflector agent、`skills/llmdoc/references/` 大部头等废弃；Codex 角色文件只接受 ACPlugin 从两个 Claude 角色契约重生成。

## 2. 双平台策略:Claude 为准源,ACPlugin 转换 Codex

1. Claude Code 表面(根目录)是唯一手工维护的插件形态;
2. Codex 表面(`.codex-plugin/` + skills 化包装)由 **ACPlugin**(插件互转项目)从 Claude 表面转换生成,本仓库不自建 generate/verify 管线;
3. 配一份 parity checklist(命令集、授权语义、hook 行为逐条对照),转换结果按 checklist 抽验,防行为漂移;
4. Codex 当前支持 project-scoped custom agents；保留 ACPlugin 从两个 Claude 角色契约生成的 `.codex/agents/*.toml`,但不手工维护第二份角色文本,也不在安装后另行改写用户项目;
5. 其他平台(Cursor、Gemini CLI 等)不做插件:README 提供一段 AGENTS.md 配方 + `npx @tokenroll/llmdoc`(CLI 是强制依赖也是跨平台契约,插件只是发行渠道)。

共同约束:

- upgrade 入口禁止隐式调用,正文惰性加载;
- hook 只注入短状态信号,失败不阻塞开发;
- 插件不复制 CLI 已承担的机械逻辑。

## 3. CI

- lint + CLI 单元/集成测试;
- `llmdoc validate` 跑本仓库 dogfood `llmdoc/`;
- prompt 预算检查:operating skill、各命令 SOP、hook 输出的 token 上限(超限 fail);
- 发布:npm 发布 `@tokenroll/llmdoc`,插件随 tag 打包。

## 4. 实施阶段

1. **CLI 地基**:MDX/front matter 解析 + schema + `validate / tree / index / show / search / context / new / mv`;
2. **状态面**:`meta.json` + `status / delta / fingerprint` + 三个 hook 子命令;
3. **Prompt 重写**:operating + init/update SOP + 两个 agent 契约,在本仓库 dogfood(init 自举);
4. **收敛与迁移**:`prune --report` + growth gate;`upgrade` V2→V3;
5. **打包发布**:npm 发布 `@tokenroll/llmdoc` + Claude 插件表面定稿 + ACPlugin 转换 Codex 表面 + CI + parity checklist。

每阶段结束用本仓库 dogfood 验证后再进下一阶段。
