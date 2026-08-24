import { spawnSync } from "node:child_process";

import { CliError } from "../lib/errors.js";
import { findProjectRoot } from "../lib/fs.js";
import { assertRevisionAdvancePreconditions, updateMetaRevisions, writeMeta } from "../lib/state.js";
import { loadWorkspace, validateWorkspace } from "../lib/workspace.js";

interface CommitOptions {
  cwd: string;
  message?: string;
  all?: boolean;
  noVerify?: boolean;
  json?: boolean;
}

// llmdoc 写入的一体化收尾:validate 门控 → commit llmdoc 写集 → fingerprint → meta 单独小 commit。
// 消灭手工三步曲及其 amend 追尾陷阱;--no-verify 透传给 git(husky 等重钩子仓库)。
export function runCommit(options: CommitOptions): unknown {
  const rootDir = findProjectRoot(options.cwd);

  const preflightWorkspace = loadWorkspace(rootDir);
  const issues = validateWorkspace(preflightWorkspace);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new CliError(`validate 未通过,拒绝提交:\n${errors.map((issue) => `  ${issue.code} (${issue.path})`).join("\n")}`);
  }

  const porcelain = runGit(rootDir, ["status", "--porcelain", "--", "llmdoc"]);
  if (!porcelain.trim()) {
    return options.json ? { status: "no_change", commits: [], updated: [] } : "no_change: llmdoc/ 无待提交变更";
  }
  const changedDocPaths = porcelain
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((filePath) => (filePath.includes(" -> ") ? filePath.split(" -> ").pop()! : filePath))
    .filter((filePath) => filePath.startsWith("llmdoc/") && filePath.endsWith(".mdx"));

  const verifyFlags = options.noVerify ? ["--no-verify"] : [];
  // 在创建任何 commit 前预检 fingerprint 的全部前置条件(git 可推进、关联源码无 dirty):
  // 预检失败时 fail-closed,工作树保持调用前状态,避免留下 docs 已提交但 meta 未刷新的半完成状态。
  const preflightDocPaths = changedDocPaths
    .map((filePath) => filePath.slice("llmdoc/".length))
    .filter((llmdocPath) => preflightWorkspace.documentsByLlmdocPath.has(llmdocPath));
  try {
    assertRevisionAdvancePreconditions({
      workspace: preflightWorkspace,
      llmdocPaths: preflightDocPaths,
      updateAll: options.all ?? false
    });
  } catch (error) {
    throw new CliError(`fingerprint 预检未通过,未创建任何 commit: ${(error as Error).message}`, 70);
  }

  runGit(rootDir, ["add", "--", "llmdoc"]);
  runGit(rootDir, ["commit", ...verifyFlags, "-m", options.message ?? "docs(llmdoc): update knowledge", "--", "llmdoc"]);
  const docsCommit = runGit(rootDir, ["rev-parse", "HEAD"]).trim();

  // 重新加载:提交后的 workspace 是 fingerprint 的事实基础;已删除文档的 ledger 孤儿由 updateMetaRevisions 清理。
  const workspace = loadWorkspace(rootDir);
  const existingDocPaths = changedDocPaths
    .map((filePath) => filePath.slice("llmdoc/".length))
    .filter((llmdocPath) => workspace.documentsByLlmdocPath.has(llmdocPath));
  const { meta, updatedPaths } = updateMetaRevisions({
    workspace,
    llmdocPaths: existingDocPaths,
    updateAll: options.all ?? false
  });
  writeMeta(workspace.metaPath, meta);
  runGit(rootDir, ["add", "--", "llmdoc/meta.json"]);
  runGit(rootDir, ["commit", ...verifyFlags, "-m", "chore(llmdoc): refresh fingerprints", "--", "llmdoc/meta.json"]);
  const metaCommit = runGit(rootDir, ["rev-parse", "HEAD"]).trim();

  if (options.json) {
    return {
      status: "success",
      commits: [docsCommit, metaCommit],
      updated: updatedPaths,
      baselineAdvanced: options.all ?? false
    };
  }
  return [
    `committed: ${docsCommit.slice(0, 7)} (docs) + ${metaCommit.slice(0, 7)} (meta)`,
    `fingerprints: ${updatedPaths.length} document(s)${options.all ? ", baseline advanced" : ""}`
  ].join("\n");
}

function runGit(rootDir: string, args: string[]): string {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) {
    throw new CliError((result.stderr || result.stdout || `git ${args[0]} 失败`).trim());
  }
  return result.stdout;
}
