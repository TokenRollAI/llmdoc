# llmdoc for Claude Code 和 Codex

`llmdoc` 是一个同时面向 Claude Code 和 Codex 的文档驱动工作流。

- Skill: `llmdoc`
- `/llmdoc:init` 负责初始化 `llmdoc/`
- `/llmdoc:update` 负责先写 reflection，再更新稳定文档

推荐的默认配置很简单：

- `CLAUDE.md` 和 `AGENTS.md` 里只保留一条短规则：step one 是加载 `llmdoc` skill
- skill 入口保持简短，详细的方法论、协议和模板拆到 `skills/llmdoc/references/`
- skill 还定义了主动阅读 guides/reflection，以及在非简单改动前主动和用户沟通
- skill 还恢复了一个好模式：在非简单任务结束时，主动询问是否运行 `/llmdoc:update`
- agent 和 command 只负责执行，不再各自复制一大段说明

## 为什么这么改

旧设计暴露了太多内部步骤：

- 读文档、调研、文档工作流都做成了独立 skill
- `scout` 和 `investigator` 角色高度重叠
- 默认输出倾向于行级引用，不利于文件级检索

这次改动把外部接口缩到最小，把详细协议统一收敛到一个可复用 skill 里。

## 公开接口

- Skill: `llmdoc`
- Commands: `/llmdoc:init`, `/llmdoc:update`
- Claude Code plugin 支持：`.claude-plugin/`
- Codex CLI plugin 支持：已提供 `.codex-plugin/plugin.json` 和 `.agents/plugins/marketplace.json`
- Codex CLI subagents 支持：已提供 `.codex/agents/*.toml`
- Codex CLI hooks：已提供 `SessionStart`、`Stop` 模板

## 工作流

### `use`

`use` 不是命令。

它是由 `llmdoc` skill 定义的默认工作模式。推荐做法是在系统提示词里先要求模型加载这个 skill，再按 skill 里的规则工作。

### `/llmdoc:init`

用 `/llmdoc:init` 初始化或修复 `llmdoc` 结构。

这个命令会：

1. 检查仓库结构
2. 创建 llmdoc 目录骨架
3. 启动多个 investigator 生成临时调查草稿，显式检查覆盖面，并补做一轮查缺补漏
4. 生成初始 MUST、overview、architecture、reference 文档
5. 同步 `llmdoc/index.md`

### `/llmdoc:update`

在一次有价值的任务完成后，用 `/llmdoc:update` 持久化新知识。

这个命令会：

1. 基于 llmdoc 和当前 working tree 重建上下文
2. 主动阅读相关 guides 和 reflection
3. 调研受影响的概念
4. 在 `llmdoc/memory/reflections/` 下写 reflection
5. 更新稳定文档
6. 同步 `llmdoc/index.md`

在日常使用里，如果任务产生了值得长期保留的知识或反思，主 assistant 应该主动询问是否现在运行 `/llmdoc:update`。

## llmdoc 结构

```text
llmdoc/
├── index.md
├── startup.md
├── must/                 # 每次运行都应读取的小型启动上下文
├── overview/             # 项目和特性的身份与边界
├── architecture/         # 检索地图、不变量、所有权边界
├── guides/               # 一篇文档只讲一个工作流
├── reference/            # 稳定的查阅型事实和约定
└── memory/
    ├── reflections/      # 每次任务后的反思
    ├── decisions/        # 长期保留的过程或设计决策
    └── doc-gaps.md       # 已知文档缺口

.llmdoc-tmp/
└── investigations/       # 临时调查草稿
```

`llmdoc/index.md` 是全局文档地图。
`llmdoc/startup.md` 只负责启动阅读顺序。
两者可以互相链接，但不应该重复同一批内容。

## 内部 Agents

| Agent | 用途 |
|------|------|
| `investigator` | 做证据驱动的调研，可回对话，也可输出临时调查草稿 |
| `worker` | 执行明确的任务 |
| `recorder` | 维护稳定 llmdoc 文档 |
| `reflector` | 记录任务后的 reflection |

## 安装

### Claude Code

先安装 Claude Code。Anthropic 官方文档当前给出的安装方式包括：

- `npm install -g @anthropic-ai/claude-code`
- 或 macOS/Linux/WSL 原生安装：`curl -fsSL https://claude.ai/install.sh | bash`

官方文档：

- https://docs.anthropic.com/en/docs/claude-code/quickstart
- https://docs.anthropic.com/en/docs/claude-code/setup

然后安装这个插件市场和插件：

```bash
/plugin marketplace add https://github.com/TokenRollAI/llmdoc
/plugin install llmdoc@llmdoc-cc-plugin
```

安装后：

1. 把 [`CLAUDE.example.md`](CLAUDE.example.md) 复制到 `~/.claude/CLAUDE.md`
2. 如果你还想加仓库级约束，可以把 [`AGENTS.example.md`](AGENTS.example.md) 改成项目根目录下的 `AGENTS.md`
3. 重启 Claude Code，让新的 prompt 和 plugin 状态生效

### Codex CLI

先安装 Codex CLI。OpenAI 官方文档当前给出的最小安装方式是：

```bash
npm i -g @openai/codex
codex
```

官方文档：

- https://developers.openai.com/codex/cli
- https://developers.openai.com/codex/plugins
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/hooks

这个仓库已经内置了 Codex 侧需要的文件：

- [`.codex-plugin/plugin.json`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex-plugin/plugin.json)
- [`.agents/plugins/marketplace.json`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.agents/plugins/marketplace.json)
- [`.codex/config.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/config.toml)
- [`.codex/agents/`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents)
- [skills/llmdoc/templates/codex-hooks.json](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/skills/llmdoc/templates/codex-hooks.json)

在 Codex 里做 repo-local 使用时：

1. 用 Codex 打开这个仓库
2. 确认 `.agents/plugins/marketplace.json` 存在
3. 重启 Codex，让 marketplace 和 project-scoped agents 重新加载
4. 如果需要 hooks，把模板复制到 `.codex/hooks.json`，并按你的机器路径调整脚本路径

## 仓库内文件

可复用 skill 位于 [`skills/llmdoc/SKILL.md`](skills/llmdoc/SKILL.md)。
详细参考文档位于 [`skills/llmdoc/references/`](skills/llmdoc/references/)。
Codex CLI hooks 模板位于 [`skills/llmdoc/templates/`](skills/llmdoc/templates/)。

## Codex Subagents

这个仓库现在也包含 project-scoped 的 Codex 自定义 agents：

- [`.codex/config.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/config.toml)
- [`.codex/agents/llmdoc-investigator.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents/llmdoc-investigator.toml)
- [`.codex/agents/llmdoc-worker.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents/llmdoc-worker.toml)
- [`.codex/agents/llmdoc-recorder.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents/llmdoc-recorder.toml)
- [`.codex/agents/llmdoc-reflector.toml`](/Users/djj/.superset/worktrees/cc-plugin/DJJ/djj/skill/.codex/agents/llmdoc-reflector.toml)

这些文件遵循官方 Codex subagents 文档里 project-scoped TOML agents 的模式，放在 `.codex/agents/` 下。

这里使用了 `llmdoc_` 前缀，避免覆盖 Codex 自带的 `worker`、`explorer` 等内置 agents。

## 迁移说明

这个版本把旧的碎片化 skill 收敛成一个 skill：

- 当前 skill: `llmdoc`
- 移除 skills: `read-doc`、`investigate`、`update-doc`、`doc-workflow`、`deep-dive`、`commit`
- 移除 commands: `initDoc`、`withScout`、`what`
- 移除 agent: `scout`

如果你之前依赖这些入口：

- 用 `/llmdoc:init` 替代旧的 `tr` 前缀 init 命令
- 用 `/llmdoc:update` 替代 `/update-doc`
- 用 `llmdoc` skill 替代分散的 read/investigate skill
