import fs from "node:fs";

import { CliError } from "../lib/errors.js";
import { findProjectRoot } from "../lib/fs.js";
import { readWorkspaceGitState } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";
import { MetaLedger } from "../types.js";

interface InitStateOptions {
  cwd: string;
  json?: boolean;
}

// init/upgrade 场景的 meta.json 骨架生成:
// 全部文档登记为 validatedRevision: null(未验证,delta 会如实标 impacted),
// convergence 用当前实测统计。真正的 revision 烙印仍由 fingerprint 完成。
export function runInitState(options: InitStateOptions): unknown {
  const rootDir = findProjectRoot(options.cwd);
  const workspace = loadWorkspace(rootDir);
  if (workspace.meta) {
    throw new CliError("llmdoc/meta.json 已存在;init-state 只用于首次建立台账,不覆盖现有状态。");
  }
  const git = readWorkspaceGitState(workspace);
  if (!git.available || !git.headRevision) {
    throw new CliError(git.degradedReason ?? "无法解析 HEAD commit,init-state 需要 git 仓库。");
  }

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const meta: MetaLedger = {
    schema: "llmdoc.meta/v3",
    baseline: {
      revision: git.headRevision,
      verifiedAt: now
    },
    documents: Object.fromEntries(workspace.documents.map((document) => [document.llmdocPath, { validatedRevision: null }])),
    convergence: {
      capturedAt: now,
      source: "init",
      documentCount: workspace.documents.length,
      totalEstimatedTokens: workspace.documents.reduce((sum, document) => sum + document.estimatedTokens, 0)
    }
  };
  fs.writeFileSync(workspace.metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  if (options.json) {
    return {
      status: "success",
      documents: workspace.documents.length,
      baselineRevision: git.headRevision,
      next: "npx @tokenroll/llmdoc fingerprint --all"
    };
  }
  return `initialized llmdoc/meta.json: ${workspace.documents.length} documents (validatedRevision: null), baseline ${git.headRevision.slice(0, 7)}\nnext: 验证文档内容后运行 \`npx @tokenroll/llmdoc fingerprint --all\` 烙印 revision`;
}
