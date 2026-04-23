# PR 说明：enhance — Init/Update 调查持久化恢复与大型仓库首轮文档阈值放宽

## PR 标题

```text
feat: sync init/update persistence recovery and relax large-repo first-pass doc targets
```

## 概述

本 PR 聚焦 llmdoc 的三类协同改进：

1. **Init 调查编排与四状态恢复协议落地**  
   `/llmdoc:init` 现在明确区分 `persisted`、`write_failed_fallback_ready`、`transport_failure`、`context_overflow` 四种文件落盘调查结果，并要求以哨兵、canonical `output_path`、sidecar 恢复和定向 follow-up 的顺序处理；首轮 investigation subagent 启动个数也改为按仓库体量阈值分档控制。

2. **Update 与 Init 的文件落盘协议对齐**  
   `/llmdoc:update` 现在在需要 file-sink 调查时复用与 init 相同的持久化检查、fallback 写入、sidecar 恢复和授权升级路径；同时会按需重建 `.llmdoc-tmp/investigations/`，不再假设 init 会把该目录保留到下一次 update。

3. **大型仓库首轮稳定文档数量阈值放宽**  
   首轮稳定文档仍坚持“先深后广”，但核心 architecture/reference 文档目标改为按仓库规模分档：小型/中型仓库通常 `2-3` 篇，大型仓库可以放宽到 `3-5` 篇，只要这些文档分别承载不同的不变量簇、执行流或契约面。

以上改动已经同步到命令契约、agent prompt、Codex helper skill、架构文档、维护指南和中英文 README，避免出现“命令已变、执行提示还停留在旧规则”的偏差。

## 背景与动机

### 1. Init 的恢复协议需要可验证的持久化定义

之前的恢复逻辑默认“子 agent 有返回”就足够推进流程，但这会把三类不同问题混在一起：

- **真正已持久化**：文件完整写入且可复用
- **写入失败但 markdown 还在返回载荷里**：主 assistant 可以补写
- **传输层失败或上下文溢出**：返回通道不可靠，必须先检查磁盘状态

如果没有哨兵、canonical 路径和 sidecar 恢复顺序，覆盖率门控会把缺失或截断的调查报告误判为“可用”。

### 1.1 Init 的体量分档与首轮 investigation subagent 启动个数

Init 的 fan-out 不是固定值，而是先按排除依赖、生成物、缓存和 VCS 目录后的第一方源码与测试文件估算仓库体量，再决定首轮 investigation subagent 个数。

当前体量分档为：

- **小型仓库**：`<= 1000 LOC`
- **中型仓库**：`1001-5000 LOC`
- **大型仓库**：`> 5000 LOC`

对应的首轮 investigation subagent / investigator 启动个数为：

- **小型仓库**：`1-2`
- **中型仓库**：`2-3`
- **大型仓库**：`3-5`

这个阈值的目的不是追求最大并发，而是在限制第一波 fan-out 的同时保持主题覆盖稳定。也就是说：

- 小仓库避免为了“并行”而过度切碎调查主题
- 中仓库允许有明确的主题切片，但仍应避免把边缘主题拆成独立 subagent
- 大仓库允许更宽的第一波 fan-out，但仍应以主题切分和覆盖率门控为前提，而不是无约束扩张

### 2. Update 之前没有补齐与 Init 同级别的恢复路径

`/llmdoc:update` 新增 file-sink 调查能力之后，暴露出两个缺口：

- **目录存在性假设错误**：init 成功后会删除 `.llmdoc-tmp/`，因此 update 不能假定 `.llmdoc-tmp/investigations/` 始终存在
- **最终失败升级路径缺失**：当主 assistant 也无法写 fallback 文件或无法从 sidecar 恢复 canonical `output_path` 时，流程必须暂停并向用户请求写入授权，而不是卡在未定义状态

### 3. 大型仓库首轮核心文档数过紧

原先“首轮稳定文档优先 `2-3` 篇”的表述，对小型和中型仓库是合理的，但对大型仓库有点过于保守。  
当仓库确实存在多个应分开记录的不变量簇、运行流和契约面时，把首轮强行压成 `2-3` 篇会造成：

- 过度聚合，降低检索性
- 核心文档内部混入过多互不相干的执行模型
- `recorder` 在实践中倾向于把不该捏在一起的内容塞进同一篇

因此本 PR 只放宽“大型仓库首轮核心文档数”，不放宽“浅文档泛滥”的总体约束。

## 变更内容

### 协议表面：Init / Investigator / Recovery

| 文件 | 改动内容 |
|------|---------|
| `commands/init.md` | 明确四状态协议；要求 `output_path` 为 canonical artifact；sidecar 只作恢复来源；`transport_failure` 时先查 `output_path` 再查 sidecar，必要时复制还原主路径；`context_overflow` 时拆分为 ≤3 个子 brief；首轮 investigation subagent 启动个数按体量阈值分档（小型 `1-2` / 中型 `2-3` / 大型 `3-5`）；大型仓库首轮核心文档数放宽为 `3-5` |
| `agents/investigator.md` | `OutputFormat_File` 明确哨兵为最后一行、主写入优先、sidecar 为 best-effort 恢复通道、`SIDECAR_PATH` 字段和 Brief 预算 |
| `.codex/agents/llmdoc-investigator.toml` | 将 investigator 的持久化协议、哨兵、sidecar、failure payload 与 Claude prompt 保持一致 |
| `skills/llmdoc-init/SKILL.md` | 与 `commands/init.md` 同步 recovery 契约；补充大型仓库首轮核心文档可为 `3-5` |

### Update 工作流对齐

| 文件 | 改动内容 |
|------|---------|
| `commands/update.md` | 在 file-sink 调查或主 assistant fallback 写入前按需重建 `.llmdoc-tmp/investigations/`；复用 init 的 canonical `output_path` / sentinel / sidecar 恢复协议；补齐“无法建目录 / 无法写 fallback / 无法还原 canonical 路径”时的用户授权升级路径 |
| `skills/llmdoc-update/SKILL.md` | 与 `commands/update.md` 同步，确保 Codex helper skill 不落后于命令契约 |

### 稳定文档生成策略

| 文件 | 改动内容 |
|------|---------|
| `commands/init.md` | 首轮调查 fan-out 改为 size-aware：小型仓库 `1-2` 个 investigator，中型 `2-3` 个，大型 `3-5` 个；首轮稳定文档也改为 size-aware：小型/中型仓库通常 `2-3` 篇，大型仓库允许 `3-5` 篇深度 architecture/reference 文档 |
| `agents/recorder.md` | 将“2-3 strong core docs”改为按仓库规模分档，避免 `recorder` 在大仓库上被过度约束 |
| `skills/llmdoc-init/SKILL.md` | 对 helper skill 明确同样的首轮 investigation subagent 启动阈值和首轮核心文档数量策略 |
| `llmdoc/architecture/init-investigation-orchestration.md` | 将首轮 investigation fan-out 和“small number of deep core docs”都细化为按仓库大小的目标范围 |

### 架构文档、指南与路由

| 文件 | 改动内容 |
|------|---------|
| `llmdoc/architecture/init-investigation-orchestration.md` | 记录 init 的恢复顺序、不变量、Codex 并发限制、sidecar 只作恢复来源，以及按仓库规模放宽的大仓库首轮核心文档策略 |
| `llmdoc/guides/updating-init-investigation-depth.md` | 校验清单与常见失败点同步到最新 recovery 契约；说明大仓库可以拥有更宽的首轮核心文档集 |
| `llmdoc/index.md` | 路由描述更新为包含 recovery / transport-failure / follow-up 等新语义 |
| `llmdoc/must/doc-routing.md` | init 相关路由规则加入“报告持久化回退、传输失败恢复”等修改前置阅读要求 |

### 公开说明

| 文件 | 改动内容 |
|------|---------|
| `README.md` | 更新 init / update 工作流摘要；说明 init 的四状态恢复；新增 update 的按需重建 scratch 目录与授权升级路径；新增大型仓库首轮核心文档 `3-5` 的说明 |
| `README.zh-CN.md` | 与英文 README 同步 |

### 反思文档

| 文件 | 内容 |
|------|------|
| `llmdoc/memory/reflections/2026-04-20-subagent-transport-failure.md` | 传输层失败为什么不能直接等价于“重新跑一遍” |
| `llmdoc/memory/reflections/2026-04-21-context-overflow-recovery.md` | 为什么需要哨兵、context overflow 状态以及平台感知的恢复策略 |

### 其他修改

| 文件 | 改动内容 |
|------|---------|
| `.claude-plugin/plugin.json` | 版本号更新为 `3.0.0` |
| `.claude/settings.local.json` | 增加本仓库本地 Claude 权限白名单：`WebFetch(domain:claude.com)`、`WebSearch` |

## 文件落盘调查失败处理

Init 是四状态协议的主场景；Update 在需要 file-sink scratch 调查时复用同一协议。

| 状态 | 触发条件 | 恢复路径 |
|------|---------|---------|
| `persisted` | 报告已写入 canonical `output_path`，且包含 `<!-- llmdoc:eor -->` 哨兵 | 验证 `output_path` 存在、非空、含哨兵后继续 |
| `write_failed_fallback_ready` | 主写入失败，但完整 markdown 仍在返回载荷中 | 协调 assistant 将 `report_markdown` 写回同一 `output_path`，再验证哨兵 |
| `transport_failure` | 工具调用 internal error / missing result，无返回载荷 | 先查 `output_path`，再查 `<output_path>.sidecar.md`；若只有 sidecar 完整，则复制还原 canonical `output_path` 并验证；两者都不可恢复才重跑 |
| `context_overflow` | 文件存在但哨兵缺失，说明报告被截断 | 不重跑同样 scope；将 brief 拆为 ≤3 个更窄子 brief，走 follow-up 槽 |

补充说明：

- `<!-- llmdoc:eor -->` 必须是报告文件最后一行
- sidecar 不是持久化成功状态，只是恢复来源
- 只有 canonical `output_path` 被验证成功，主题才算完成
- 如果主 assistant 无法创建 scratch 目录、无法写 fallback 文件、或无法从有效 sidecar 还原 canonical `output_path`，必须暂停并向用户请求写入授权

## 首轮稳定文档策略

首轮稳定文档仍然遵循“先深后广”：

- **小型 / 中型仓库**：通常先产出 `2-3` 篇核心 architecture / reference 文档
- **大型仓库**：允许先产出 `3-5` 篇，只要这些文档分别覆盖不同的不变量簇、流程或契约边界

这不是鼓励首轮铺很多浅文档，而是给大型仓库留下足够的结构表达空间。  
依然不应该把首轮稳定文档扩张成 `10+` 篇浅层摘要。

## 首轮 investigation subagent 启动阈值

在生成稳定文档之前，`/llmdoc:init` 会先按体量分档决定第一波 investigation subagent 的启动个数：

- **小型仓库**：`1-2`
- **中型仓库**：`2-3`
- **大型仓库**：`3-5`

这里的“按阈值启动个数”是首轮调查 fan-out 上限，不是硬性要求必须把配额打满。  
如果主题面较少、某些主题可以合并、或当前平台前台稳定性不足，实际启动个数可以低于上限，但不应该在同等体量下无理由超过该范围。

## 非目标

- 不修改 `.codex/config.toml` 中的 `max_threads` / `max_depth`
- 不把 sidecar 提升为新的 canonical artifact
- 不放宽“浅文档泛滥”的约束；大型仓库放宽的是核心文档数量，不是允许随意拆碎
- 不修改单篇文档的拆分原则，例如“一个 workflow 一篇 guide”“一个 ownership / invariant cluster 一篇 architecture”

## 验证清单

- [ ] 在小型仓库运行 `/llmdoc:init`，确认预调查校准提示出现，并显示 `No extra context, continue`
- [ ] 确认小型仓库首轮 investigator 扇出仍为 `1-2`
- [ ] 确认中型仓库首轮 investigator 扇出为 `2-3`
- [ ] 确认大型仓库首轮 investigator 扇出为 `3-5`
- [ ] 确认第一波结束后触发覆盖率门控；仅在有缺口时触发 follow-up
- [ ] 手动检查调查报告最后一行为 `<!-- llmdoc:eor -->`
- [ ] 模拟 `transport_failure`，确认先查 `output_path` 再查 sidecar；若 sidecar 完整则复制还原 canonical 路径
- [ ] 模拟 `context_overflow`，确认走 brief 拆分路径而非重跑同样 scope
- [ ] 在“init 已清理 `.llmdoc-tmp/`”之后运行 `/llmdoc:update`，确认会按需重建 `.llmdoc-tmp/investigations/`
- [ ] 模拟 `/llmdoc:update` 的 fallback 写入失败或 sidecar 还原失败，确认会暂停并请求用户授权，而不是无声卡住
- [ ] 在大型仓库场景下，确认首轮稳定文档允许 `3-5` 篇深度 architecture / reference 文档，而不是被硬压成 `2-3`
- [ ] 验证中英文 README 对 init / update / recovery / 大型仓库首轮文档阈值的描述保持一致
