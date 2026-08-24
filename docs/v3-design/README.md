# llmdoc V3 设计

> Status: Draft for review
> 关联 Issue: [#32 llmdoc V3 持久化工程上下文架构彻底重构](https://github.com/TokenRollAI/llmdoc/issues/32)
> 本设计基于 issue #32 的 V3 spec 草案(00–08)review 后重新收敛,差异见下文「与原 spec 的差异」。

## 一句话定位

llmdoc 是工程的**持久化外置上下文**:把代码里无法低成本恢复的架构、约束、工作方式组织为可渐进检索的知识,让 AI 不必每次会话重新理解整个仓库。

## 设计原则

1. **轻量优先**:不引入重机械。Markdown + YAML front matter 是基座,MDX 只作最小增强;事务靠 git,不自建 snapshot/journal;检索靠词法,必要时 grep 也能用。
2. **CLI 即 Runtime,且是强制依赖**:所有确定性工作(索引、校验、delta、检索、hook 信号)由 npm 包 `@tokenroll/llmdoc` 承担,该包暴露可执行文件 `llmdoc`;判断性工作(写什么知识、怎么组织)留给模型;prompt 只描述"什么时候调哪个命令"。使用环境必须先安装 `@tokenroll/llmdoc`,并能运行解析到该本地 bin 的 `npx llmdoc`——正因如此,全局地图可以由 `llmdoc tree` 动态生成,不再需要手工维护的根 index。
3. **结构即知识**:目录层级本身承载分类学,固定两层(根单例 + topic folder);topic 是纯目录,没有任何静态入口节点——全局与 topic 级摘要都由 CLI 动态聚合。
4. **文档本身仍是纯粹的 Markdown**:MDX 只作最小增强,`cat` 单份文档依然完全可读;但导航、检索、校验依赖 CLI,不为无 CLI 环境做设计妥协。
5. **git-native**:路径即文档 ID,变更检测锚定 git revision,回滚就是 `git checkout`。

## 文档索引

| 文档 | 内容 |
|---|---|
| [01-knowledge-model.md](01-knowledge-model.md) | `llmdoc/` 目录结构、front matter、kind、MDX profile、写作规范 |
| [02-meta-and-validity.md](02-meta-and-validity.md) | `meta.json`、revision-based 变更检测、git-based 写入协议 |
| [03-cli.md](03-cli.md) | `@tokenroll/llmdoc` 命令面、输出契约、hook 子命令 |
| [04-workflows.md](04-workflows.md) | init / update / prune / upgrade 流程、agent 角色、渐进读取协议 |
| [05-packaging.md](05-packaging.md) | 仓库布局、Claude Code / Codex 插件、ACPlugin 衔接 |

## 与原 V3 spec(issue #32 附件)的差异

| # | 原 spec | V3 最终设计 | 理由 |
|---|---|---|---|
| 1 | 抽象 Runtime,无实体承诺 | 实体化为 npm 包 `@tokenroll/llmdoc` | 能力不落地就会退化回 prompt,重蹈 V2 覆辙 |
| 2 | Domain-first 平铺 + kind 子目录 | 根单例 + 一层 topic folder,folder 内平铺,kind 只在 front matter;无静态根入口,全局地图由 `llmdoc tree` 动态生成 | 消除 kind 的双真相源与会腐烂的手写目录;固定深度利于 AI 确定性导航 |
| 3 | 每文档稳定 `id` 字段 | 路径即 ID,无 id 字段 | git-native;重命名靠 `git mv` + CLI 批量改引用 |
| 4 | 自定义内容 fingerprint(hash) | git revision 锚点(`validatedRevision`) | delta 就是 `git diff`,不自建 hash 体系 |
| 5 | 六步事务 + journal + 独立复核 | git-based:写前 clean → 写后 validate → 失败 revert | llmdoc 活在 git 里,不重造数据库 |
| 6 | kind 六类(含 index/decision/reflection) | 三类:`architecture / guide / reference` | decision/reflection 砍掉;index 入口节点砍掉(dogfood 实测其独特价值只剩 topic 描述,CLI 可聚合) |
| 7 | Reflection 案例积累 + 阈值晋升管线 | 移除;`.llmdoc-tmp/records/` 存过程记录,不进 git 知识面 | 简化;沉淀机制改为 update 时回灌 |
| 8 | Investigator / Reflector / Recorder 三角色 | Investigator / Recorder 两角色 | Reflection 管线移除后 Reflector 失去独立职责 |
| 9 | 双平台生成管线 + 大 parity 矩阵 | CLI 承载逻辑,插件是薄 prompt 壳;跨插件转换交给 ACPlugin | 成本降一个量级;第三方平台靠 CLI + AGENTS.md 配方即可接入 |
| 10 | `meta.json` 禁止一切可重建状态 | 保持单文件、只存有效性台账(方向一致,字段大幅简化) | 文档量不大,目录/图实时扫描即可;聚合索引方案留待 benchmark |

## 已拍板的关键决策

- **`@tokenroll/llmdoc` 是强制依赖**:npm 包名是 `@tokenroll/llmdoc`,bin 名是 `llmdoc`;所有使用环境必须先安装该包,再运行 `npx llmdoc`(Node ≥ 18)。
- Markdown + YAML front matter 为基座;使用标准 MDX 语法但组件白名单仅 `<CodeRef>`,且为可选增强。
- 路径即文档 ID。
- `meta.json` 单文件,只存有效性台账(方案 A);聚合索引(方案 B)留待后续 benchmark。
- 变更检测用 git revision,不做自定义 hash;worktree 未提交改动只标记 dirty。
- 目录固定两层:根单例 + topic folder,**禁止再嵌套**。
- **根级不设静态 index**:V2 `index.md` 的地图/路由职责由 `llmdoc tree` 动态承担;根单例(如 `architecture.mdx`)是 init 模板的推荐槽位,schema 不强制。
- **topic 无入口节点**:任何位置禁止 `index.mdx`;topic 摘要由 `llmdoc tree` 从文档聚合,purpose/boundary 归 topic 的 `architecture.mdx` 推荐槽位(dogfood 后由「必有入口」修订而来)。
- 事务性 = git-based,无独立复核。
- 检索 V1 只做词法(front matter 过滤 + BM25 级全文),不做 embedding。
- 过程记录(工作日志、过去的 plan)归 `.llmdoc-tmp/`,不进 git 知识面;update 时是否记录由主 assistant 判断。
- 平台封装:**仓库根即标准 Claude Code plugin 形态**;Codex 侧插件由 ACPlugin 转换承接,不自建生成管线。

## 开放问题(不阻塞实现)

1. `meta.json` 是否升级为聚合索引(方案 B):等 CLI 落地后对"每次启动全量扫描 front matter"的成本做 benchmark 再定。
2. `<CodeRef>` 的段落级 delta 反查(定位"文档中哪一段的依据变了"):V1 只做文档级影响面,段落级作为后续增强。
3. topic folder 固定一层是否够用:在大型 monorepo 上 dogfood 后复核;若不够,优先"拆新 topic"而不是恢复嵌套。
