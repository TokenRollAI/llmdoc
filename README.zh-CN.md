# llmdoc V3

[English](README.md)

`llmdoc` 是代码仓库的持久化外置上下文：把 AI 不该每次会话都重新恢复的架构、约束和工作知识放进可检索、可验证、可演进的文档层。

## 强制依赖

- Node.js 18 或更新版本
- 先安装 `@tokenroll/llmdoc`，再运行 `npx @tokenroll/llmdoc`
- git 作为有效性、delta 与回滚语义的基础

推荐把 CLI 装进项目依赖，例如：

```bash
npm install --save-dev @tokenroll/llmdoc
```

V3 假定 CLI 始终存在。导航、检索、校验、delta 检测、hook 信号和工作流入口都来自 `npx @tokenroll/llmdoc`。

> 一律使用完整 scoped 名调用：`npx @tokenroll/llmdoc <cmd>`，永远不要用裸的 `npx llmdoc`——在未安装本包的环境里，裸名会解析到 npm 上一个无关的第三方包。使用 scoped 名则不存在任何错包风险：npx 会运行本地已安装副本，缺失时自动获取正确的包。hooks 使用 `npx --no-install @tokenroll/llmdoc`，保证离线安全且 fail-open。


## 公开接口

- Claude Code 的 canonical 插件表面位于仓库根：
  - `.claude-plugin/`
  - `skills/` (operating skill + explicit workflow skills)
  - `agents/`
  - `hooks/hooks.json`
- CLI runtime：`npx @tokenroll/llmdoc <command>`
- 显式工作流：
  - `init`
  - `update`
  - `prune`
  - `upgrade`
- 两个角色：
  - `investigator`：把证据调查写入 `.llmdoc-tmp/investigations/`
  - `recorder`：唯一允许写入 tracked `llmdoc/` 知识和 `llmdoc/meta.json` 的角色

Claude 是唯一手工维护的准源。Codex 插件表面由它通过 ACPlugin 转换生成。其他平台只需要一份精简 `AGENTS.md` 加 `npx @tokenroll/llmdoc`。

## 知识模型

V3 使用 `.mdx` 文档，内容是纯 Markdown、YAML front matter，以及一个可选的最小增强 `<CodeRef>`。

- 路径就是文档 ID
- `kind` 只存在于 front matter，不体现在目录名里
- tracked 知识树固定为两层：
  - 根级单例文档，例如 `llmdoc/architecture.mdx`
  - 一层 topic 文件夹，例如 `llmdoc/api-client/retry-policy.mdx`
- topic 就是纯目录：没有 `index.mdx` 入口节点，topic 摘要由 `llmdoc tree` 聚合
- 不允许 topic 嵌套
- 根级地图由 `llmdoc tree` 动态生成，V2 那种根 `index.md` 已移除

tracked 有效性记录在 `llmdoc/meta.json`：

- `validatedRevision` 基于 git revision
- dirty worktree 只是附加信号，不是第二套真相系统
- 写入遵循 git-based 协议：修改后校验，失败时通过 git 回退

临时过程记录放在 `.llmdoc-tmp/`，不属于 tracked knowledge。

## CLI 命令表

| 命令 | 作用 |
|---|---|
| `npx @tokenroll/llmdoc tree` | 动态根地图，列出根单例和 topics |
| `npx @tokenroll/llmdoc index [--topic ...] [--kind ...]` | 输出文档发现用的 front matter 投影 |
| `npx @tokenroll/llmdoc show <path...>` | 读取指定文档正文 |
| `npx @tokenroll/llmdoc search <query>` | 在知识层做词法检索 |
| `npx @tokenroll/llmdoc context --files <src...>` | 从源码文件反查推荐阅读文档 |
| `npx @tokenroll/llmdoc status` | 输出当前有效性、baseline、dirty 与 growth 信号 |
| `npx @tokenroll/llmdoc delta` | 从代码变更推导受影响文档闭包 |
| `npx @tokenroll/llmdoc validate` | 校验 schema、结构、关系、链接与 code paths |
| `npx @tokenroll/llmdoc fingerprint --update <path...> \| --all` | 刷新 `llmdoc/meta.json` 中的 validated revisions |
| `npx @tokenroll/llmdoc new <path> --kind <kind>` | 脚手架生成新的 V3 文档 |
| `npx @tokenroll/llmdoc mv <from> <to>` | 移动文档并更新引用 |
| `npx @tokenroll/llmdoc prune --report` | 输出收敛报告但不写文档 |
| `npx @tokenroll/llmdoc upgrade` | 显式的 V2 到 V3 迁移入口 |
| `npx @tokenroll/llmdoc hook session-start` | 给宿主提供启动信号 |
| `npx @tokenroll/llmdoc hook stop` | 给宿主提供停止时提醒信号 |
| `npx @tokenroll/llmdoc hook compact` | 输出 compact 状态 |

## 工作流语义

### `init`

为一个还没有 llmdoc 的仓库创建第一版 V3 知识。

- 当仓库缺少 llmdoc 时，assistant 可以建议执行
- 用户一旦调用，就授权本次初始化范围
- 如果仓库里已有 V2 知识，应改用 `upgrade`

### `update`

把 tracked knowledge 同步到当前仓库状态。

- assistant 应该在出现可持久化的新知识后建议执行，但必须先得到一次确认
- 确认后，除非 scope 实质性扩张，否则流程可以完整跑完而不重复确认
- 命令会根据 CLI 信号选择最轻但足够的路径：
  - 影响明确时直接由 recorder 更新
  - 影响不清或涉及结构变化时走 investigator + recorder

### `prune`

在 update 之后收敛重复或膨胀的知识。

- 只允许显式调用
- 命中 growth gate 时可以被建议
- 执行前需要一次确认

### `upgrade`

把仓库从 V2 迁移到 V3。

- 只允许显式调用
- 永不主动建议
- 应在独立的 git 迁移步骤中执行，保证整次迁移可整体回滚

## 结果状态

所有显式工作流都只报告以下一个精确结果名：

- `success`
- `no_change`
- `dry_run`
- `incomplete`
- `failed`

## 渐进读取

日常使用以 CLI 为入口：

1. `npx @tokenroll/llmdoc tree`
2. 用 `npx @tokenroll/llmdoc index --topic <t>` 看文档元数据
3. 用 `npx @tokenroll/llmdoc context --files ...` 或 `npx @tokenroll/llmdoc search ...`
4. 仅对真正需要的文档执行 `npx @tokenroll/llmdoc show ...`

V3 不再保留 V2 的 startup pack、根路由文档、`worker`、`reflector` 或 `sync.md` 契约。CLI 本身就是入口。

## 安装与验证

### Claude Code

仓库内已验证的插件安装入口：

```bash
/plugin marketplace add https://github.com/TokenRollAI/llmdoc
/plugin install llmdoc@llmdoc-cc-plugin
```

### Codex

按[官方插件文档](https://developers.openai.com/plugins/build/plugins)把本仓库添加为 plugin marketplace 源，然后在 Plugins Directory 中安装 `llmdoc`：

```bash
codex plugin marketplace add TokenRollAI/llmdoc
```

marketplace 目录是 `.agents/plugins/marketplace.json`；插件 manifest 是 `.codex-plugin/plugin.json`，skills 位于 `.agents/skills/`，hooks 在默认位置 `hooks/hooks.json`。Codex 打包由 Claude 表面经 ACPlugin 转换生成，请勿手工编辑。

Codex 要求用户在非托管插件 hooks 运行前审查并信任它们；安装后用 `/hooks` 检查。

### 本仓库开发验证

这个仓库常用的本地验证命令：

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:dogfood
npm run check:prompts
```

请从仓库根目录安装依赖，确保本地 `llmdoc` bin 在校验前已建立链接。`validate:dogfood` 用于校验本仓库 dogfood 的 `llmdoc/` 知识面。

## 仓库形态

```text
.
├── .claude-plugin/
├── .codex-plugin/          # 由 Claude 表面转换生成
├── agents/
│   ├── investigator.md
│   └── recorder.md
├── cli/
├── hooks/
│   └── hooks.json
├── skills/
│   ├── llmdoc/          # operating skill
│   ├── init/
│   ├── update/
│   ├── prune/
│   └── upgrade/
├── llmdoc/
│   ├── meta.json
│   ├── architecture.mdx
│   └── <topic>/*.mdx
└── .llmdoc-tmp/
    ├── cache/
    ├── investigations/
    └── records/
```

## 其他平台

Claude Code 与 Codex 用户由插件承担这一切（hooks、operating skill、工作流命令）。没有原生插件系统的工具，安装 `@tokenroll/llmdoc` 后把下面这份配方贴进项目的 `AGENTS.md` 即可：

```markdown
# llmdoc

本项目使用 llmdoc V3 作为持久化工程上下文。

- 必须已安装 `@tokenroll/llmdoc`；一律以 `npx @tokenroll/llmdoc ...` 调用。
- 大范围探索前先 `npx @tokenroll/llmdoc tree`，再按需 `index --topic`、
  `context --files`、`search`，最后才用 `show` 读正文。
- 只读当前任务需要的内容；相关性由文档 description 判断。
- `init` / `update` / `prune` / `upgrade` 是显式工作流：可以建议、须经用户
  确认后执行；永不主动建议 `upgrade`。
- 稳定知识在 `llmdoc/`；不要手工编辑 `llmdoc/meta.json`（用 `fingerprint` /
  `new` / `mv`）。临时材料放 `.llmdoc-tmp/`。
- 完成改变架构、契约或工作流的任务后，建议执行 update 工作流。
```

## 示例提示词

- “先加载 llmdoc，检查这个仓库，并告诉我应该先读哪些 topic 文档。”
- “在这些架构改动之后执行 llmdoc update 工作流。”
- “把这个仓库从 llmdoc V2 升级到 V3。”
