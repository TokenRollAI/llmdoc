# 01. 知识模型:目录结构、Front matter 与写作规范

## 1. 生成目录

```text
llmdoc/
├── meta.json              # 有效性台账(见 02),唯一非 MDX 文件
├── architecture.mdx       # 推荐槽位:项目定位、跨域整体架构与关键引导
├── <topic>/               # 主题域,固定一层,禁止嵌套;纯目录,无入口节点
│   ├── architecture.mdx   # 推荐槽位:本域架构(含 purpose/boundary)
│   └── *.mdx              # 自由命名:guide | reference
└── <topic>/...
```

规则:

- 层级固定两层:根单例 + topic folder。**topic folder 内不允许再建子目录**;需要嵌套说明应该拆一个新 topic。
- **没有任何静态 index**:全局地图由 `llmdoc tree` 动态生成,topic 摘要由 CLI 从文档 front matter 聚合(CLI 是强制依赖,见 03)。手写的目录/清单必然腐烂,V3 不维护任何一份;`index.mdx` 文件名在任何位置都被 validate 拒绝。
- topic 的 purpose/boundary 需要成文时,写进该 topic 的 `architecture.mdx` 推荐槽位;只有零散短事实的 topic 直接靠文档 description route。
- 根单例(如 `architecture.mdx`)是 init 模板的推荐槽位,schema 不强制——小项目不被逼着写空文件。
- kind 只在 front matter 表达,目录不承载 kind 语义(topic 内平铺)。
- 不生成 `index.md`、`startup.md`、`must/`、`overview/`、`memory/`、`records/` 等 V2 遗留结构。
- 不建立成熟文档 archive;当前有效知识必须位于正常检索路径。

## 2. 三种知识面

| 知识面 | 位置 | 装什么 |
|---|---|---|
| 根单例 | `llmdoc/*.mdx` | 无法归入单一 topic 的跨域知识:项目定位、整体架构、关键引导、部署说明 |
| 主题域 | `llmdoc/<topic>/` | 一个可独立理解、维护、更新的工程能力(billing、api-client、build-release、plugin-packaging……) |
| 过程面 | `.llmdoc-tmp/` | 调查报告、工作记录、过去的 plan、缓存——**不进 git 知识面**,详见 04 |

「document 装不下的东西」的归宿:

- 整体架构、关键性引导、部署说明 → 根单例(`architecture.mdx` 等);
- topic 内的引导、边界、短事实 → 该 topic 的 `architecture.mdx` 推荐槽位(不必单独立档);
- 工作记录、过去的 plan → `.llmdoc-tmp/records/`;
- 做完任务的经验 → 不单独归档,通过 update **直接改写进相关 architecture/guide**(见 04)。

## 3. Topic 粒度

创建独立 topic 应同时满足多数条件:

- 有独立目的和术语;
- 有稳定的代码或配置关联;
- 能独立发生变更;
- 读取该能力时不需要加载大量无关知识。

不应拆分的信号:只有一两条事实(并进现有文档即可);只是源码目录的镜像;拆分后所有任务仍要同时读多个 topic。

Topic 的拆分与合并由 Recorder 决定,需要 Investigator 证据;目录统计本身不自动改变边界。

## 4. Topic 内推荐形式

topic 是纯目录,没有入口节点(dogfood 实测入口页的独特价值只剩 topic 描述,而这由 CLI 聚合更可靠)。推荐形式:**固定命名的推荐槽位 + 自由命名的专题文档**。固定槽位的价值是跨 topic 可预测——AI 不读内容就知道任何 topic 的 `architecture.mdx` 都是本域架构。

| 文件 | 强制性 | kind | 装什么 |
|---|---|---|---|
| `architecture.mdx` | 推荐槽位 | `architecture` | 本域 purpose、boundary、组件关系、数据流、不变量、设计因果 |
| 其余 `*.mdx` | 自由命名 | `guide` / `reference` | 一事一档的操作指南与查询事实 |

命名惯例(推荐,不做 schema 校验):

- guide 用动宾短语:`adding-a-command.mdx`、`updating-hooks.mdx`;
- reference 用名词短语:`error-codes.mdx`、`config-options.mdx`;
- 文件名是路由的一部分,与 description 互补;禁用 `misc.mdx`/`notes.mdx` 这类无信息量命名,`index.mdx` 被 validate 直接拒绝。

路由要求:

- 每份文档的 `description` 必须让 AI 不读正文即可判断相关性——这是没有入口页之后路由的全部依赖;
- 只有一两条短事实的 topic 不为凑形式立多档:写进一份文档即可,`llmdoc tree` 的文档名聚合就是它的摘要。

## 5. 文档格式:MDX + YAML Front matter

文件后缀 `.mdx`。构成 = YAML front matter + 标准 Markdown + 极小组件白名单。

**重点是 front matter,不是 MDX 的表达力。** 禁止任意 JSX、JS 表达式、import——保证不装 CLI 时 `cat` 也完全可读。

```mdx
---
description: 请求重试的适用条件、退避规则以及禁止重试的错误类型。
kind: guide
relations:
  requires:
    - api-client/error-model.mdx
code:
  paths:
    - src/api/retry.ts
---

# 请求重试策略

幂等 GET 之外的请求默认不重试,判定入口见 <CodeRef path="src/api/retry.ts" symbol="isRetryable" />。
...
```

### 5.1 Front matter 字段

必填(所有文档):

| 字段 | 约束 |
|---|---|
| `description` | 一到两句话,能让 AI **不读正文就判断相关性**。这是渐进披露的基石,质量要求最高 |
| `kind` | `architecture / guide / reference` |

可选:

| 字段 | 约束 |
|---|---|
| `relations.requires` | 阅读本页前必须理解的文档,值为 `llmdoc/` 下相对路径 |
| `relations.related` | 非强依赖的相关文档路径 |
| `code.paths` | 仓库相对路径或受限 glob。**这是代码↔文档关联的唯一必需机制**,CLI 据此计算变更影响面 |

不设 `id`(路径即 ID)、不设 `domain`(所在 folder 即 topic)、不设 `code.symbols`(经验:symbol 列表写多了 AI 也不会读,精确锚点交给正文 `<CodeRef>`)。schema 版本记录在 `meta.json` 全局一处,不在每份文档重复。

空字段不写。任何字段必须对路由、校验或 delta 有确定用途,否则不进 schema。

### 5.2 禁止写入 front matter

当前 commit、hash、校验时间、反向关系边、目录清单、会话状态、临时计划——分别属于 `meta.json`、CLI 实时计算或 `.llmdoc-tmp/`。

### 5.3 组件白名单

V1 只有一个组件:

```mdx
<CodeRef path="src/api/retry.ts" symbol="isRetryable" />
```

- 用途:正文段落级的精确代码锚点,`symbol` 可选;
- 定位:**可选增强,克制使用**(建议每文档少量,不超过个位数)。影响面计算 V1 只依赖 front matter `code.paths`,`<CodeRef>` 的段落级 delta 反查是后续增强;
- 校验:`llmdoc validate` 校验 `path` 存在;`symbol` 存在性校验尽力而为,不阻塞。

文档间引用**不需要组件**:普通 Markdown 相对链接即可(`[错误模型](../api-client/error-model.mdx)`),CLI 校验链接不悬空。不发明 wikilink 等新语法。

## 6. 各 kind 的职责

| Kind | 负责内容 | 不应包含 |
|---|---|---|
| `architecture` | 组件关系、数据流、边界、因果与不变量;topic 级承担本域 purpose/boundary,根级额外承担项目整体定位与关键引导 | 逐步操作手册、字段大全 |
| `guide` | 完成具体任务的前置条件、步骤、验证与失败处理 | 架构百科、API 全量参考 |
| `reference` | API、配置、命令、约定等精确查询事实 | 需按顺序执行的完整 SOP |

## 7. 写作规范(对 AI 友好的三条硬约束)

1. **渐进式暴露**:每一层(`llmdoc tree` → `llmdoc index --topic` → 文档 front matter → 正文)都必须支持"读到这里就能决定要不要继续往下读"。description 为此服务。
2. **单文档体积上限**:正文建议 ≤ 150 行 / ≈2000 tokens,`llmdoc validate` 超限告警。超了优先拆文档,让 description 承担路由。
3. **不做太重**:kind 有推荐骨架(guide = 前置/步骤/验证;architecture = 组件/关系/不变量)但**不做 schema 强制校验**;结构服务于可读性,不服务于格式合规。

正文优先保存:不变量与约束、为什么如此设计、跨文件关系、容易误用的边界、可重复执行的 SOP。

正文不应保存:可由符号搜索直接得到的代码清单、逐 commit 日志、任务过程记录、大段源码复制、与其他文档重复的通用说明。
