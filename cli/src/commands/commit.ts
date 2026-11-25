import { spawnSync } from "node:child_process";

import { CliError } from "../lib/errors.js";
import { findProjectRoot } from "../lib/fs.js";
import { isSourceRef } from "../lib/source-id.js";
import { assertRevisionAdvancePreconditions, readWorkspaceGitState, updateMetaRevisions, writeMeta } from "../lib/state.js";
import { loadWorkspace, validateWorkspace } from "../lib/workspace.js";

interface CommitOptions {
  cwd: string;
  message?: string;
  all?: boolean;
  verified?: string[];
  noVerify?: boolean;
  json?: boolean;
}

// llmdoc 写入的一体化收尾:validate 门控 → commit llmdoc 写集 → fingerprint → meta 单独小 commit。
// 消灭手工三步曲及其 amend 追尾陷阱;--no-verify 透传给 git(husky 等重钩子仓库)。
export function runCommit(options: CommitOptions): unknown {
  const rootDir = findProjectRoot(options.cwd);

  const preflightWorkspace = loadWorkspace(rootDir);
  for (const value of options.verified ?? []) {
    if (isSourceRef(value)) {
      throw new CliError(`External source documents (@...) are read-only and cannot be passed to commit --verified: ${value}`);
    }
  }
  const verifiedPaths = uniquePaths(
    (options.verified ?? []).map((value) => (value.startsWith("llmdoc/") ? value.slice("llmdoc/".length) : value))
  );
  if (options.all && verifiedPaths.length > 0) {
    throw new CliError("commit cannot use --all and --verified together.");
  }
  for (const docPath of verifiedPaths) {
    if (!preflightWorkspace.documentsByLlmdocPath.has(docPath)) {
      throw new CliError(`Document does not exist: ${docPath}`);
    }
  }

  const preflightGit = readWorkspaceGitState(preflightWorkspace);
  if (preflightGit.available && preflightGit.detached) {
    throw new CliError("Cannot run commit on a detached HEAD. Create or switch to a branch first (e.g. `git checkout -b <branch>`).", 70);
  }

  const issues = validateWorkspace(preflightWorkspace);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new CliError(`Validation failed; refusing to commit:\n${errors.map((issue) => `  ${issue.code} (${issue.path})`).join("\n")}`);
  }

  const porcelain = runGit(rootDir, ["status", "--porcelain", "--", "llmdoc"]);
  const hasLlmdocChanges = Boolean(porcelain.trim());
  if (!hasLlmdocChanges && !options.all && verifiedPaths.length === 0) {
    return options.json ? { status: "no_change", commits: [], updated: [] } : "no_change: llmdoc/ has no changes to commit";
  }
  const changedDocPaths = porcelain
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((filePath) => (filePath.includes(" -> ") ? filePath.split(" -> ").pop()! : filePath))
    .filter((filePath) => filePath.startsWith("llmdoc/") && filePath.endsWith(".mdx"));

  const existingChangedDocPaths = changedDocPaths
    .map((filePath) => filePath.slice("llmdoc/".length))
    .filter((llmdocPath) => preflightWorkspace.documentsByLlmdocPath.has(llmdocPath));
  const targetPaths = uniquePaths([...existingChangedDocPaths, ...verifiedPaths]);

  const verifyFlags = options.noVerify ? ["--no-verify"] : [];
  // 在创建任何 commit 前预检 fingerprint 的全部前置条件(git 可推进、关联源码无 dirty):
  // 预检失败时 fail-closed,工作树保持调用前状态,避免留下 docs 已提交但 meta 未刷新的半完成状态。
  try {
    assertRevisionAdvancePreconditions({
      workspace: preflightWorkspace,
      llmdocPaths: targetPaths,
      updateAll: options.all ?? false
    });
  } catch (error) {
    throw new CliError(`Fingerprint preflight failed; no commit was created: ${(error as Error).message}`, 70);
  }

  if (changedDocPaths.length === 0) {
    return commitMetaOnly({
      rootDir,
      workspace: preflightWorkspace,
      verifiedPaths,
      updateAll: options.all ?? false,
      hasLlmdocChanges,
      verifyFlags,
      json: options.json ?? false
    });
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
    llmdocPaths: uniquePaths([...existingDocPaths, ...verifiedPaths]),
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

function commitMetaOnly(input: {
  rootDir: string;
  workspace: ReturnType<typeof loadWorkspace>;
  verifiedPaths: string[];
  updateAll: boolean;
  hasLlmdocChanges: boolean;
  verifyFlags: string[];
  json: boolean;
}): unknown {
  const { rootDir, workspace, verifiedPaths, updateAll, hasLlmdocChanges, verifyFlags, json } = input;
  const headRevision = runGit(rootDir, ["rev-parse", "HEAD"]).trim();
  const requestedPaths = updateAll ? workspace.documents.map((document) => document.llmdocPath) : verifiedPaths;
  const refreshNeeded = updateAll
    ? !revisionIsCurrent(rootDir, workspace.meta!.baseline.revision, headRevision) ||
      requestedPaths.some((docPath) =>
        !revisionIsCurrent(rootDir, workspace.meta!.documents[docPath]?.validatedRevision ?? null, headRevision)
      )
    : requestedPaths.some((docPath) =>
        !revisionIsCurrent(rootDir, workspace.meta!.documents[docPath]?.validatedRevision ?? null, headRevision)
      );

  if (!hasLlmdocChanges && !refreshNeeded) {
    return json
      ? { status: "no_change", commits: [], updated: [] }
      : "no_change: requested fingerprints are already current";
  }

  let updatedPaths: string[] = [];
  if (refreshNeeded) {
    const result = updateMetaRevisions({
      workspace,
      llmdocPaths: verifiedPaths,
      updateAll
    });
    writeMeta(workspace.metaPath, result.meta);
    updatedPaths = result.updatedPaths;
  }

  runGit(rootDir, ["add", "--", "llmdoc/meta.json"]);
  runGit(rootDir, ["commit", ...verifyFlags, "-m", "chore(llmdoc): refresh fingerprints", "--", "llmdoc/meta.json"]);
  const metaCommit = runGit(rootDir, ["rev-parse", "HEAD"]).trim();

  if (json) {
    return {
      status: "success",
      commits: [metaCommit],
      updated: updatedPaths,
      baselineAdvanced: updateAll
    };
  }
  return [
    `committed: ${metaCommit.slice(0, 7)} (meta)`,
    `fingerprints: ${updatedPaths.length} document(s)${updateAll ? ", baseline advanced" : ""}`
  ].join("\n");
}

// commit 自身会在 fingerprint 锚点之后创建一个只修改 meta.json 的 follow-up commit。
// 这种差异不代表知识又过期了,否则重复 commit 会无限追逐自己创建的 meta commit。
function revisionIsCurrent(rootDir: string, revision: string | null, headRevision: string): boolean {
  if (!revision) {
    return false;
  }
  if (revision === headRevision) {
    return true;
  }
  const changedPaths = runGit(rootDir, ["diff", "--name-only", `${revision}..${headRevision}`, "--"])
    .split(/\r?\n/)
    .filter(Boolean);
  return changedPaths.every((filePath) => filePath === "llmdoc/meta.json");
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)].sort();
}

function runGit(rootDir: string, args: string[]): string {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) {
    throw new CliError((result.stderr || result.stdout || `git ${args[0]} failed`).trim());
  }
  return result.stdout;
}
