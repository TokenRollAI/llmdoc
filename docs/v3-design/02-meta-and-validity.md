# 02. Meta 与有效性:`meta.json`、revision 变更检测、git-based 写入

## 1. `meta.json` 定位

`llmdoc/meta.json` 是**有效性台账**(方案 A):只保存"无法从当前文件树重建"的历史验证状态。它不是聚合索引、目录 catalog 或会话状态——目录、description、关系图都靠实时扫描 front matter 获得(文档量不大,全量扫描成本可接受;是否升级为聚合索引留待 benchmark,见 README 开放问题)。

## 2. 规范形态

```json
{
  "schema": "llmdoc.meta/v3",
  "baseline": {
    "revision": "<上次全量 init/update 完成时的 commit>",
    "verifiedAt": "<timestamp>"
  },
  "documents": {
    "api-client/retry-policy.mdx": {
      "validatedRevision": "<commit>"
    },
    "api-client/error-model.mdx": {
      "validatedRevision": "<commit>"
    }
  },
  "convergence": {
    "capturedAt": "<timestamp>",
    "source": "init | prune",
    "documentCount": 0,
    "totalEstimatedTokens": 0
  }
}
```

约束:

- `documents` 以 `llmdoc/` 下相对路径为 key(路径即 ID);`git mv` 重命名后由 CLI 同步 key 与全部引用。
- 时间戳只用于审计,不参与相等判断。
- 删除文档时对应 entry 在同一次提交中删除(`llmdoc validate` 校验 ledger 与文件树一致)。
- `convergence` 是最近一次 init/prune 后的规模快照,用于 growth 信号(见 04);只存几个统计数,不存 per-topic 明细。

## 3. 变更检测:git revision,不做自定义 hash

### 3.1 原理

每份文档的有效性锚定在 `validatedRevision`:该 commit 时点,文档内容与其 `code.paths` 声明的源码被验证为一致。

Delta 计算(`llmdoc delta`)完全基于 git:

```text
对每份文档:
  changed = git diff --name-only <validatedRevision>..HEAD 与 code.paths 的交集
  changed 非空 → 文档受影响

全仓快速路径:
  git diff --name-only <baseline.revision>..HEAD
  → 与所有文档 code.paths 并集求交 → 受影响文档集合
  → 不落入任何 code.paths 的变更文件 → unmapped paths(提示可能缺文档)
```

影响闭包沿 `relations.requires` 反向扩展一跳:被受影响文档 requires 的文档标记为"需复核",不自动标记为失效。

### 3.2 Worktree 语义

- 未提交的改动(staged/unstaged/untracked)只产生 **dirty 信号**:CLI 报告"这些文档的关联代码有未提交修改",不做精确验证;
- `validatedRevision` 与 `baseline.revision` 只能指向真实存在的 commit,**不为 worktree 状态伪造 revision**;
- 在 merge/rebase/cherry-pick 中间状态不推进任何 revision。

### 3.3 Baseline 推进规则

- 全仓 scope 的 init/update 完整成功 → `baseline.revision` 推进到当前 HEAD;
- 局部 update(只处理部分 topic/文档)→ 只刷新对应 `documents[*].validatedRevision`,**不推进 baseline**;后续全量 update 仍能发现 scope 外变化,并利用 per-document revision 跳过已验证内容。

## 4. 写入协议:git-based,不自建事务

所有对 `llmdoc/` 的正式写入(init / update / prune / upgrade)遵循:

```text
1. 前置检查   git status -- llmdoc/ 必须 clean
              (有未提交修改 → 停止,提示用户先处理,不覆盖)
2. 写入       Recorder 直接编辑 llmdoc/ 与 meta.json
3. 校验门控   llmdoc validate 必须通过
              (schema、链接悬空、CodeRef path、ledger 一致性、体积告警)
4. 失败回滚   git checkout -- llmdoc/  (回到写前状态)
5. 提交       校验通过后正常 git commit(或留给用户提交)
```

对比原 spec 的取舍:

- snapshot / journal / 可恢复备份 → git 本身就是;
- 并发检测 → 步骤 1 的 clean 检查 + git 的合并机制;
- 独立 investigator 复核 → 降级为可选(重大 prune 时可以做,不是协议要求);
- `meta.json` 与 Markdown 的一致性 → 不靠事务保证,靠 `validate` 门控保证(不一致就过不了校验,过不了就 revert)。

`meta.json` 保持单文件。多分支并行改 `llmdoc/` 时它可能冲突,但字段极简(基本只有 revision 值),冲突解决成本低;冲突后跑一次 `llmdoc validate` 确认一致性即可。

## 5. 运行结果契约

命令结束时向用户报告五种状态之一:

| 状态 | 含义 | baseline |
|---|---|---|
| `success` | 声明 scope 内验证与写入完整 | 按 3.3 规则推进 |
| `no_change` | scope 完整验证,无需写入 | 按 3.3 规则推进 |
| `dry_run` | 只产出报告/方案,未写 `llmdoc/` | 不推进 |
| `incomplete` | 证据不足或需用户决策,已写内容已 revert | 不推进 |
| `failed` | 工具或校验错误,已 revert | 不推进 |

不提供 best-effort success:scope 可以显式缩小,但不能在 scope 内打折后仍报告 success。

## 6. 严重陈旧

严重陈旧不是"落后很多 commit",而是无法可靠建立增量对应:大量 `code.paths` 失效、topic 拓扑与工程普遍不符、多数知识无法验证。此时 CLI/Investigator 只提供诊断与重建建议,引导用户自行备份或删除 `llmdoc/` 后重新 init;**工具不自动删除**。
