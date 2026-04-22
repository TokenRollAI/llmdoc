# llmdoc for Claude Code 和 Codex

`llmdoc` 是一个同时面向 Claude Code 和 Codex 的文档驱动工作流。

- Core skill: `llmdoc`
- Claude Code commands: `/llmdoc:init`、`/llmdoc:update`
- Codex helper skills: `llmdoc-init`、`llmdoc-update`

推荐的默认配置很简单：

- `CLAUDE.md` 和 `AGENTS.md` 里只保留一条短规则：step one 是加载 `llmdoc` skill
- core skill 入口保持简短，详细的方法论、协议和模板拆到 `skills/llmdoc/references/`
- core skill 还定义了主动阅读 guides/reflection，以及在非简单改动前主动和用户沟通
- 整套工作流还恢复了一个好模式：在非简单任务结束时，主动询问是否运行 `/llmdoc:update`
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
3. 进行一轮简短的调研前用户确认；如果无需补充，直接回车即可继续并按仓库证据推进
4. 按项目体量和主题驱动 investigator 调查，显式检查调查报告是否已落盘，在 subagent 写入失败时由主 assistant 补写，并只做定向补查，不重跑整仓
5. 展示一份必选的调查后概念列表，让用户直接生成文档，或补充术语、重点、约定
6. 生成初始 MUST、overview、architecture、reference 文档
7. 同步 `llmdoc/index.md`
8. 在稳定文档完成后移除 `.llmdoc-tmp/`

项目体量的估算基于“排除依赖、生成物、缓存和 VCS 目录之后”的第一方源码与测试文件。至少会忽略 `node_modules/`、`dist/`、`build/`、`.next/`、`coverage/`、`vendor/` 和 `.git/`；lockfile、生成产物、vendored code 和缓存目录也不计入阈值。当前分档为：小型 `<= 1000 LOC`，中型 `1001-5000 LOC`，大型 `> 5000 LOC`。

首轮稳定文档仍然坚持“先深后广”，但核心文档数量现在按仓库规模放宽：小型和中型仓库通常先产出 `2-3` 篇深度 architecture / reference 文档，大型仓库如果确实存在多个应独立成文的不变量簇，可以先产出 `3-5` 篇。

如果 investigator 能返回调研结果但无法把草稿写入 `.llmdoc-tmp/investigations/`，init 现在会先由主 assistant 把返回的 markdown 补写到同一路径。investigator 在返回前还会尽量把同一份 markdown 再写入 `<output_path>.sidecar.md`，这样即便工具框架传输层丢掉整个返回（例如 `Tool result missing due to internal error`），主 assistant 也能直接从磁盘恢复报告，而不用通过模型重新展开这份 markdown。sidecar 只是恢复来源：如果 `output_path` 缺失但 sidecar 完整，主 assistant 会先把 sidecar 复制回 `output_path`，验证恢复后的 canonical 文件，再继续后续流程。只有在主 assistant 的 fallback 写入或这次恢复 copy 也失败时，才会请求用户授权继续。

#### Investigator 失败处理

Init 追踪四种 investigator 结果状态，每种有不同的恢复路径：

| 状态 | 触发条件 | 恢复路径 |
|------|---------|---------|
| `persisted` | 报告已写盘且含 `<!-- llmdoc:eor -->` 哨兵 | 验证文件后继续 |
| `write_failed_fallback_ready` | 写盘失败，返回完整 markdown | 主 assistant 写到同一路径并验证哨兵 |
| `transport_failure` | 工具调用返回 internal error，无 payload | 先查 `output_path`，再查 sidecar；如果只有 sidecar 完整，则先复制回 `output_path` 并验证；只有两条路径都不可恢复时才重跑 |
| `context_overflow` | 文件存在但哨兵缺失（被截断） | 拆分 brief 为 ≤3 个子 brief，走 follow-up 槽 |

每个 investigator 报告的最后一行写入哨兵 `<!-- llmdoc:eor -->`。没有哨兵的文件视为截断（`context_overflow`），不会被当作已完成的报告。哨兵只存在于 `.llmdoc-tmp/investigations/` 临时文件中，随目录在 init 结束时一并清除。

平台并发限制决定恢复时的扇出方式：

- **Claude Code**：并发上限 10，超出自动排队。溢出恢复的子 brief 可以并发发出，超出上限会排队等待。
- **Codex**：受 `.codex/config.toml` 中 `max_threads` 和 `max_depth` 约束。恢复时的子 brief 必须控制在剩余预算内，线程或深度紧张时优先串行执行。

context overflow 的恢复路径不会用同样的 scope 重跑——会再次溢出。正确做法是将该 topic 拆分，走现有的 follow-up 槽位串行处理。

### `/llmdoc:update`

在一次有价值的任务完成后，用 `/llmdoc:update` 持久化新知识。

在 Claude Code 里，它是 command。
在 Codex 里，用 helper skill `llmdoc-update` 走等价工作流。

这个命令会：

1. 基于 llmdoc 和当前 working tree 重建上下文
2. 主动阅读相关 guides 和 reflection
3. 在需要 file-sink 临时报告时按需重建 `.llmdoc-tmp/investigations/`，并用和 init 一致的落盘检查与 fallback 恢复机制调研受影响的概念
4. 在 `llmdoc/memory/reflections/` 下写 reflection
5. 更新稳定文档
6. 同步 `llmdoc/index.md`

如果 `/llmdoc:update` 发生在一次已经清理掉 `.llmdoc-tmp/` 的 init 之后，而这次 update 又需要 file-sink 临时调查报告，它会先重建 `.llmdoc-tmp/investigations/`，再启动调查或补写 fallback 文件。如果主 assistant 无法创建该目录、无法写入 fallback 报告，或无法从有效 sidecar 恢复 `output_path`，就必须暂停并向用户请求写入授权，而不是无声卡住。

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

兼容性说明：如果 Claude Code 本地还缓存着旧的 marketplace 条目，比如 `tokenroll-cc-plugin`，可以按下面的命令重置 marketplace 并重新加载插件：

```bash
/plugin marketplace remove tokenroll-cc-plugin
/plugin marketplace add https://github.com/TokenRollAI/llmdoc
/plugin install llmdoc@llmdoc-cc-plugin
/reload-plugins
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

#### 方式一：直接在 Codex 里使用这个仓库

适合你就在这个仓库里工作，并且希望插件跟着这个 repo 走。

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

#### 方式二：把 `llmdoc` 安装成个人全局本地插件

适合你希望这台机器上的其他仓库也能使用 `llmdoc` 插件。

1. 把这个仓库复制到 `~/.codex/plugins/llmdoc`：

```bash
mkdir -p ~/.codex/plugins
cp -R /absolute/path/to/llmdoc ~/.codex/plugins/llmdoc
```

2. 新建或更新 `~/.agents/plugins/marketplace.json`，让它指向这个插件目录。这里的 `source.path` 需要是相对 home 目录、并带 `./` 前缀的路径：

```json
{
  "name": "local-personal",
  "interface": {
    "displayName": "My Local Plugins"
  },
  "plugins": [
    {
      "name": "llmdoc",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/llmdoc"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

3. 重启 Codex
4. 在 Codex 中执行 `/plugins`
5. 在插件列表中找到 `llmdoc`，选中进入详情页
6. 安装插件
7. 在任意仓库里新开一个对话，然后按你的目标选择入口：
   - 正常工作时，让 Codex 先加载 `llmdoc` skill
   - 要执行 `/llmdoc:init` 等价流程时，选择 `llmdoc-init`
   - 要执行 `/llmdoc:update` 等价流程时，选择 `llmdoc-update`
   - 或者输入 `@`，再显式选择这个插件或它打包进来的 skill

这种个人安装会让插件和它自带的 skill 在多个仓库里可用；但这个仓库里的 [`.codex/agents/`](.codex/agents) 和 [`.codex/config.toml`](.codex/config.toml) 仍然是 project-scoped 的，只会在你打开这个仓库时生效。

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
