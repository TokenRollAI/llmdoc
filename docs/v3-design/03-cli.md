# 03. @tokenroll/llmdoc:命令面设计

## 1. 定位与原则

CLI 是 V3 的 Runtime 实体:所有确定性、可测试、重复出现的工作从 prompt 移入 CLI。模型只负责判断(读什么、写什么知识),CLI 负责机械(扫描、索引、校验、diff、检索、hook 信号)。

- **技术栈**:TypeScript,Node ≥ 18,npm 包名 `@tokenroll/llmdoc`,唯一 bin 名 `llmdoc`;使用环境安装该包后,默认以 `npx @tokenroll/llmdoc <cmd>` 调用(MDX/remark 生态只有 JS 是一等公民)。
- **强制依赖**:所有使用 llmdoc 的环境必须先安装 `@tokenroll/llmdoc`,并确保 `npx @tokenroll/llmdoc` 解析到其本地 bin。这是硬性要求——正因为 CLI 必定在场,V3 才能砍掉手写的根 index,把全局地图交给 `tree` 动态生成。单份文档仍是纯粹的 Markdown(`cat` 可读),但导航、检索、校验不为无 CLI 环境做设计妥协。
- **双输出**:默认输出面向 agent 的 token 精简文本;`--json` 输出机器可读结构。
- **预算与分页**:批量输出带条数与预估 token 预算,超限返回 continuation cursor,**不静默截断**。
- **安全**:只接受仓库内规范化相对路径,拒绝 `..` 越界与逃逸 symlink;结构化输出过 schema 校验。

## 2. 命令清单(V1 全部实现)

### 2.1 读取面(渐进披露的机械支撑)

| 命令 | 作用 |
|---|---|
| `llmdoc tree` | **根入口的正式替代**(V2 `index.md` 的能力由它承担):输出根单例 + 全部 topic 及其文档名聚合摘要(topic 无入口节点)。默认紧凑到 topic 级;`--docs` 展开到文档级(path/kind/description)。L0/L1 |
| `llmdoc index [--topic t] [--kind k]` | 批量输出文档 front matter 投影(path/description/kind/relations/code.paths)。L2 |
| `llmdoc show <path...>` | 按路径取正文,多文档合并输出,带预算。L3 |
| `llmdoc search <query> [--topic] [--kind]` | 词法检索(front matter + 标题 + 正文,BM25 级),返回 path + description + 命中片段 |
| `llmdoc context --files <src...>` | **给 AI 的核心入口**:"我要改这些源码文件,应该先读哪些文档"——用 `code.paths` 反查 + requires 闭包 |

搜索索引缓存于 `.llmdoc-tmp/cache/`,按 mtime/revision 增量重建,删除可再生。不做 embedding。

仓库根可选 `.llmdocignore`(每行一个 minimatch pattern,`#` 注释,`dir/` 自动展开为 `dir/**`):匹配路径不参与 unmapped/dirty 信号,用于本地运行时文件、数据库等非知识面路径。

### 2.2 状态与校验面

| 命令 | 作用 |
|---|---|
| `llmdoc status` | baseline vs HEAD、失效/待复核文档数、dirty 信号、growth 概况。hook 与人共用 |
| `llmdoc delta [--scope <topic\|path...>]` | 变更代码 → 受影响文档闭包 + unmapped paths + light/deep 建议信号(见 04) |
| `llmdoc validate` | 全量校验:front matter schema、kind 合法、禁 index.mdx、层级深度(禁嵌套)、链接/requires 悬空、CodeRef path 存在、ledger 与文件树一致、体积告警。CI 与写入门控共用 |
| `llmdoc fingerprint --update <path...|--all>` | 将指定文档的 `validatedRevision` 刷到当前 HEAD(update 成功后由 Recorder 调用;命名沿用惯例,实际记录 revision) |
| `llmdoc init-state` | 首次生成 `meta.json` 台账骨架:全部文档 `validatedRevision: null` + 实测 convergence;init/upgrade 场景专用,拒绝覆盖已有台账 |
| `llmdoc commit [-m] [--all] [--no-verify]` | **一体化收尾**:validate 门控 → 以 pathspec 提交 llmdoc 写集(不卷入用户 staged 的其他文件)→ fingerprint → meta 单独小 commit。消灭手工三步曲与 `--amend` 追尾陷阱 |

### 2.3 Hook 面(webhook 需要做的事全部收敛于此)

各平台 hooks 配置退化为一行命令调用:

| 命令 | 输出 |
|---|---|
| `llmdoc hook session-start` | ≤200 token 状态信号:是否存在 llmdoc、baseline 新鲜度、失效文档数、冷启动还是 compact 重入 |
| `llmdoc hook stop` | best-effort 提醒:本次会话是否可能需要 update(基于 dirty/delta 粗信号) |
| `llmdoc hook compact` | 输出 LLMDOC_STATE 保存指令(要求 summary 保留:目标、已读文档路径、关键结论、下一步) |

Fail policy:hook 执行失败不阻塞开发;hook 永不写 `llmdoc/`;写命令不依赖 hook 才正确。

### 2.4 维护面

| 命令 | 作用 |
|---|---|
| `llmdoc new <path> --kind <k>` | 脚手架:生成带合法 front matter 的空文档 |
| `llmdoc mv <from> <to>` | 重命名/移动:`git mv` + 批量更新引用与 ledger key |
| `llmdoc prune --report` | growth 报告:当前规模 vs convergence baseline、重复/碎片候选(只报告,收敛动作由 Recorder 做) |
| `llmdoc upgrade` | 盘点 legacy/V2 到 V3 的迁移需求(惰性加载:不被其他命令引用,正常上下文零出现) |
| `llmdoc serve [--port]` | **Web Viewer**:一键启动本地 HTTP 服务(仅绑定 127.0.0.1),浏览文档结构、关系图与新鲜度,Ctrl-C 退出 |

### 2.5 Web Viewer(`serve`)

面向人的可视化界面,与 agent 消费的文本/JSON 输出互补:

- 左栏:root 单例 + topic 分组文档列表,状态点标注 fresh/impacted/needs-review/dirty,支持过滤;
- 中间:文档关系力导向图(requires 实线箭头 / related 虚线 / 正文链接细线),节点按 topic 着色、按 token 规模定径、按新鲜度描边,可拖拽缩放;
- 右栏:选中文档详情——front matter 徽章、可点击的关系跳转、code.paths、渲染后的正文(`<CodeRef>` 显示为代码锚点徽章);
- 顶栏:baseline 新鲜度、validate 结果、待同步文档数与 light/deep 建议,即"这个仓库的知识面健康度"一眼可见;
- 数据每次请求实时计算(`/api/state`),刷新即最新;不落任何持久化状态。

## 3. 输出契约示例

`llmdoc tree`(冷启动第一条命令,替代 V2 的根 index.md):

```text
llmdoc/  (23 docs, ~31k tokens)

  architecture.mdx  [architecture]
    llmdoc 是工程的持久化外置上下文;本文说明整体架构与关键引导。

  api-client/  (5 docs, ~6k tokens)
    retry-policy, error-model, interceptors, pagination, timeouts
  build-release/  (3 docs, ~3k tokens)
    versioning, npm-publish, plugin-release
  plugin-packaging/  (4 docs, ~5k tokens)
    claude-surface, codex-surface, hooks, manifests

hint: `llmdoc tree --docs` 展开文档级;`llmdoc index --topic <t>` 看文档元数据
```

`llmdoc context --files src/api/retry.ts`:

```text
1 document impacted, 1 recommended prerequisite:

  llmdoc/api-client/retry-policy.mdx  [guide]
    请求重试的适用条件、退避规则以及禁止重试的错误类型。
  requires → llmdoc/api-client/error-model.mdx  [reference]
    错误分类与可重试判定的事实来源。
```

`llmdoc status`:

```text
baseline: 1ad676f (12 commits behind HEAD)
documents: 23 total / 3 impacted / 1 needs-review / 0 dirty
unmapped changes: src/hooks/compact.ts (no covering code.paths)
growth: 23 docs, ~31k tokens (baseline 21 docs, ~27k) — below gate
```

## 4. 非目标

- 不做 embedding / 向量检索;
- 不做 daemon / watch 常驻进程(`serve` 是用户显式启动、Ctrl-C 即停的前台进程,不属于 daemon);
- 不做多仓聚合;
- 不承载业务 prompt(prompt 属于插件壳,见 05);
- CLI 不决定"知识应该写什么"——那是 Recorder(模型)的职责。
