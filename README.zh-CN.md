# llmdoc for Claude Code 和 Codex

[English](README.md)

`llmdoc` 是一个同时面向 Claude Code 和 Codex 的文档驱动工作流。

- Core skill: `llmdoc`
- Claude Code commands: `/llmdoc:init`、`/llmdoc:update`
- Codex helper skills: `llmdoc-init`、`llmdoc-update`

推荐的默认配置很简单：

- `CLAUDE.md` 和 `AGENTS.md` 里只保留一条短规则：step one 是加载 `llmdoc` skill
- core skill 入口保持简短，详细的方法论、协议和模板拆到 `skills/llmdoc/references/`
- core skill 还定义了主动阅读 guides/reflection，以及在非简单改动前主动和用户沟通
- 整套工作流还恢复了一个好模式：在非简单任务结束时，主动询问是否运行 `/llmdoc:update`
- `/llmdoc:update` 支持轻量和重型模式，所以刚完成实现后的文档更新不必每次都跑完整多 agent 流水线
- Codex helper skills 提供了接近 command 的入口，但不会误导用户以为 Codex 已经支持这个插件的自定义 slash command
- agent 和 command contract 只负责执行，不再各自复制一大段说明

## 为什么这么改

旧设计暴露了太多内部步骤：

- 读文档、调研、文档工作流都做成了独立 skill
- `scout` 和 `investigator` 角色高度重叠
- 默认输出倾向于行级引用，不利于文件级检索

这次改动把外部接口缩到最小，把详细协议统一收敛到一个可复用的核心 skill，加上少量 Codex helper skills 入口。

## 公开接口

- Core skill: `llmdoc`
- Claude Code commands: `/llmdoc:init`、`/llmdoc:update`
- Codex helper skills: `llmdoc-init`、`llmdoc-update`
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

在 Claude Code 里，它是 command。
在 Codex 里，用 helper skill `llmdoc-init` 走等价工作流。

这个命令会：

1. 检查仓库结构
2. 创建 llmdoc 目录骨架
3. 启动多个 investigator 生成临时调查草稿，显式检查覆盖面，并补做一轮查缺补漏
4. 生成初始 MUST、overview、architecture、reference 文档
5. 同步 `llmdoc/index.md`

### `/llmdoc:update`

在一次有价值的任务完成后，用 `/llmdoc:update` 持久化新知识。

在 Claude Code 里，它是 command。
在 Codex 里，用 helper skill `llmdoc-update` 走等价工作流。

这个命令会让 tracked `llmdoc/` 文档和当前仓库保持一致。稳定文档应该保持紧凑：要么比它描述的源码更小，要么能解释源码搜索无法快速提供的架构、实现意图、边界和稳定契约。

变更检测是**基于 commit** 的。一个被 git 跟踪的水位线 `llmdoc/state/sync.md` 记录 `llmdoc/` 已反映到的最后一个 source commit。默认对 `水位线..HEAD` 做 diff（自上次同步以来所有提交的净变更），成功后推进水位线。未提交的工作树变更作为附加输入纳入，但永不移动水位线。

它可以在一次运行里吞掉多批 commit —— `--range A..B`（可重复）、`--commits SHA,…`、`--since REF`、`--from SHA`、`--working-tree-only` —— 并在非 git 项目、shallow clone、首次运行无水位线、rebase/孤儿水位线等情况下优雅降级。

这个命令会选择能保证文档正确的最轻模式，触发器是 范围大小 × 作者归属 × 风险：

- `fast`：小范围、自己作者、受影响文档可点名
- `analysis`：较大范围、含任一他人提交、或恢复/首次运行的 baseline —— 一次聚焦证据 pass
- `full`：大范围或高风险、多批回填、或历史重写恢复 —— 独立的调研、反思与记录

这个命令会：

1. 读水位线并计算 commit 范围（外加任何批次 flag 与工作树）
2. 主动阅读相关 guides 和 reflection
3. 基于范围大小、作者归属、风险选择 update mode
4. 只在所选模式需要时调研受影响的概念
5. 只有出现工作流教训或缺失文档信号时，才在 `llmdoc/memory/reflections/` 下写 reflection
6. 更新稳定文档，并清账 `llmdoc/memory/doc-gaps.md`
7. 同步 `llmdoc/index.md`，并在成功后推进水位线

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

`.llmdoc-tmp/` 是本地临时 context cache。investigator 报告可以跨相邻会话保留，帮助减少重复调研，但它被 git 忽略、不会进入 index，也不是 source of truth。只有稳定、可复用的结论才应该提升到 tracked `llmdoc/` 文档里。

## 内部 Agents

| Agent | 用途 |
|------|------|
| `investigator` | 做证据驱动的调研，可回对话、调研当前现状，也可输出临时调查草稿 |
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

这个仓库里有两类不同的 Codex 集成面：

- `llmdoc` 插件本身的打包文件：
  - [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json)
  - [`skills/llmdoc/`](skills/llmdoc/)
  - [`skills/llmdoc-init/`](skills/llmdoc-init/)
  - [`skills/llmdoc-update/`](skills/llmdoc-update/)
  - [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json)，作为 repo 级本地 marketplace 示例
- 这个仓库自己的 repo-local Codex 工作流文件：
  - [`.codex/config.toml`](.codex/config.toml)
  - [`.codex/agents/`](.codex/agents)
  - [`skills/llmdoc/templates/codex-hooks.json`](skills/llmdoc/templates/codex-hooks.json)

#### 方式一：从 GitHub 安装（推荐）

适合你希望这台机器上的所有仓库都能使用 `llmdoc` 插件。

```bash
codex plugin marketplace add TokenRollAI/llmdoc
```

然后：

1. 重启 Codex，让新的 marketplace 源加载进来
2. 在 Codex 中执行 `/plugins`
3. 在插件列表中找到 `llmdoc`，选中进入详情页
4. 安装插件
5. 在任意仓库里新开一个对话，然后按你的目标选择入口：
   - 正常工作时，让 Codex 先加载 `llmdoc` skill
   - 要执行 `/llmdoc:init` 等价流程时，选择 `llmdoc-init`
   - 要执行 `/llmdoc:update` 等价流程时，选择 `llmdoc-update`
   - 或者输入 `@`，再显式选择这个插件或它打包进来的 skill

#### 方式二：直接在 Codex 里使用这个仓库（本地开发）

适合你正在这个仓库里工作——参与贡献或测试本地改动。

1. 用 Codex 打开这个仓库
2. 确认 [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) 存在
3. 如果 Codex 已经在运行，先重启一次，让 repo marketplace 和 project-scoped agents 重新加载
4. 在 Codex 中执行 `/plugins`
5. 在插件列表中找到 `llmdoc`，选中进入详情页
6. 安装插件
7. 在这个仓库里新开一个对话，然后按你的目标选择入口：
   - 正常工作时，让 Codex 先加载 `llmdoc` skill
   - 要执行 `/llmdoc:init` 等价流程时，选择 `llmdoc-init`
   - 要执行 `/llmdoc:update` 等价流程时，选择 `llmdoc-update`
   - 或者输入 `@`，再显式选择这个插件或它打包进来的 skill
8. 如果你需要 hooks，把 [`skills/llmdoc/templates/codex-hooks.json`](skills/llmdoc/templates/codex-hooks.json) 复制到 `.codex/hooks.json`，再按你的机器路径调整脚本路径

当你打开的就是这个仓库时，Codex 还会同时使用 [`.codex/agents/`](.codex/agents) 里的 project-scoped agents，以及 [`.codex/config.toml`](.codex/config.toml) 里的 agent 限制配置。

## 仓库内文件

可复用 skill 位于 [`skills/llmdoc/SKILL.md`](skills/llmdoc/SKILL.md)。
Codex helper 入口 skills 位于 [`skills/llmdoc-init/SKILL.md`](skills/llmdoc-init/SKILL.md) 和 [`skills/llmdoc-update/SKILL.md`](skills/llmdoc-update/SKILL.md)。
详细参考文档位于 [`skills/llmdoc/references/`](skills/llmdoc/references/)。
Codex CLI hooks 模板位于 [`skills/llmdoc/templates/`](skills/llmdoc/templates/)。

## Codex Subagents

这个仓库现在也包含 project-scoped 的 Codex 自定义 agents：

- [`.codex/config.toml`](.codex/config.toml)
- [`.codex/agents/llmdoc-investigator.toml`](.codex/agents/llmdoc-investigator.toml)
- [`.codex/agents/llmdoc-worker.toml`](.codex/agents/llmdoc-worker.toml)
- [`.codex/agents/llmdoc-recorder.toml`](.codex/agents/llmdoc-recorder.toml)
- [`.codex/agents/llmdoc-reflector.toml`](.codex/agents/llmdoc-reflector.toml)

这些文件遵循官方 Codex subagents 文档里 project-scoped TOML agents 的模式，放在 `.codex/agents/` 下，所以它们是在“打开这个仓库”时生效的。

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
