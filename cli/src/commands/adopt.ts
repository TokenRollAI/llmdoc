import fs from "node:fs";

import { assertDocKindMatchesShape, parseDocTargetShape } from "../lib/doc-shape.js";
import { CliError } from "../lib/errors.js";
import { findProjectRoot, normalizeRepoRelativePath, resolveInsideRoot } from "../lib/fs.js";
import { writeMeta } from "../lib/state.js";
import { loadWorkspace, validateWorkspace } from "../lib/workspace.js";

interface AdoptOptions {
  cwd: string;
  paths: string[];
  json?: boolean;
}

// 无损登记已存在的合法 .mdx 到 meta.json:只新增 validatedRevision: null 条目,
// 不重写正文;已登记路径幂等 no-op。有效 revision 仍需后续 fingerprint 验证后写入。
export function runAdopt(options: AdoptOptions): unknown {
  const rootDir = findProjectRoot(options.cwd);
  const workspace = loadWorkspace(rootDir);
  if (!workspace.meta) {
    throw new CliError("缺少 llmdoc/meta.json,先运行 llmdoc init-state。");
  }

  const llmdocPaths = options.paths.map((input) => {
    const repoRelativePath = normalizeRepoRelativePath(input.startsWith("llmdoc/") ? input : `llmdoc/${input}`);
    if (!repoRelativePath.startsWith("llmdoc/") || !repoRelativePath.endsWith(".mdx")) {
      throw new CliError(`adopt 只能登记 llmdoc/ 下的 .mdx 文档: ${input}`);
    }
    const shape = parseDocTargetShape(repoRelativePath);
    assertDocKindMatchesShape(shape);
    const absolutePath = resolveInsideRoot(rootDir, repoRelativePath, { allowMissing: true });
    if (!fs.existsSync(absolutePath)) {
      throw new CliError(`目标不存在,adopt 只登记已有文档(新建请用 llmdoc new): ${repoRelativePath}`);
    }
    if (!workspace.documentsByLlmdocPath.has(shape.llmdocPath)) {
      throw new CliError(`文档未被 workspace 识别(front matter 可能不合法): ${repoRelativePath}`);
    }
    return shape.llmdocPath;
  });

  // 目标文档自身必须通过结构校验;meta.entry.missing 正是 adopt 要修复的问题,予以豁免。
  const targetRepoPaths = new Set(llmdocPaths.map((llmdocPath) => `llmdoc/${llmdocPath}`));
  const blockingIssues = validateWorkspace(workspace).filter(
    (issue) => issue.severity === "error" && issue.path !== undefined && targetRepoPaths.has(issue.path) && issue.code !== "meta.entry.missing"
  );
  if (blockingIssues.length > 0) {
    throw new CliError(
      `目标文档未通过校验,拒绝登记:\n${blockingIssues.map((issue) => `  ${issue.code} (${issue.path}) ${issue.message}`).join("\n")}`
    );
  }

  const adopted: string[] = [];
  const alreadyRegistered: string[] = [];
  for (const llmdocPath of llmdocPaths) {
    if (workspace.meta.documents[llmdocPath]) {
      alreadyRegistered.push(llmdocPath);
    } else {
      workspace.meta.documents[llmdocPath] = { validatedRevision: null };
      adopted.push(llmdocPath);
    }
  }
  if (adopted.length > 0) {
    writeMeta(workspace.metaPath, workspace.meta);
  }

  if (options.json) {
    return {
      adopted: adopted.slice().sort(),
      alreadyRegistered: alreadyRegistered.slice().sort()
    };
  }
  const lines = [`adopted: ${adopted.length} document(s)${adopted.length > 0 ? ` — ${adopted.join(", ")}` : ""}`];
  if (alreadyRegistered.length > 0) {
    lines.push(`already registered (no-op): ${alreadyRegistered.join(", ")}`);
  }
  if (adopted.length > 0) {
    lines.push("validatedRevision 登记为 null;经 validate 后用 fingerprint/commit 写入有效 revision。");
  }
  return lines.join("\n");
}
