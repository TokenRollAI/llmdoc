import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { CliError } from "./errors.js";
import { GitState } from "../types.js";

function runGit(rootDir: string, args: string[]): string {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: rootDir,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new CliError((result.stderr || result.stdout || "git 命令失败").trim());
  }

  return result.stdout.trim();
}

export function gitMove(rootDir: string, fromRepoPath: string, toRepoPath: string): void {
  runGit(rootDir, ["mv", "--", fromRepoPath, toRepoPath]);
}

export function gitRestorePaths(rootDir: string, repoRelativePaths: string[]): void {
  runGit(rootDir, ["reset", "--quiet", "--", ...repoRelativePaths]);
  runGit(rootDir, ["checkout", "--quiet", "--", ...repoRelativePaths]);
}

export function gitCommitExists(rootDir: string, revision: string): boolean {
  const result = spawnSync("git", ["cat-file", "-e", `${revision}^{commit}`], {
    cwd: rootDir,
    encoding: "utf8"
  });
  return result.status === 0;
}

// shallow clone(CI 常态)里历史 commit 不可达,revision 校验需要据此降级而不是误报陈旧。
export function isShallowRepository(rootDir: string): boolean {
  return runGitSafe(rootDir, ["rev-parse", "--is-shallow-repository"]) === "true";
}

export function readGitState(rootDir: string, baselineRevision: string | null): GitState {
  if (!isGitRepository(rootDir)) {
    return {
      available: false,
      headRevision: null,
      detached: false,
      inProgressOperation: null,
      baselineBehindHead: null,
      committedChangedPaths: [],
      stagedPaths: [],
      unstagedPaths: [],
      untrackedPaths: [],
      degradedReason: "当前目录不是 git 仓库，状态面降级为不可用。"
    };
  }

  const headRevision = runGitSafe(rootDir, ["rev-parse", "HEAD"]);
  const detached = runGitSafe(rootDir, ["symbolic-ref", "--quiet", "--short", "HEAD"]) === null;
  const inProgressOperation = detectInProgressOperation(rootDir);
  const stagedPaths = readPathList(rootDir, ["diff", "--name-only", "--no-renames", "--cached"]);
  const unstagedPaths = readPathList(rootDir, ["diff", "--name-only", "--no-renames"]);
  const untrackedPaths = readPathList(rootDir, ["ls-files", "--others", "--exclude-standard"]);
  const committedChangedPaths =
    baselineRevision && headRevision && gitCommitExists(rootDir, baselineRevision)
      ? readPathList(rootDir, ["diff", "--name-only", "--no-renames", `${baselineRevision}..${headRevision}`])
      : [];
  const baselineBehindHead =
    baselineRevision && headRevision && gitCommitExists(rootDir, baselineRevision)
      ? readBehindCount(rootDir, baselineRevision, headRevision)
      : null;

  let degradedReason: string | null = null;
  if (!headRevision) {
    degradedReason = "无法解析 HEAD commit。";
  } else if (baselineRevision && !gitCommitExists(rootDir, baselineRevision)) {
    degradedReason = `baseline.revision 不存在于当前 git 历史: ${baselineRevision}`;
  }

  return {
    available: true,
    headRevision,
    detached,
    inProgressOperation,
    baselineBehindHead,
    committedChangedPaths,
    stagedPaths,
    unstagedPaths,
    untrackedPaths,
    degradedReason
  };
}

export function readChangedPathsSince(rootDir: string, revision: string, headRevision: string): string[] {
  if (!gitCommitExists(rootDir, revision)) {
    return [];
  }
  return readPathList(rootDir, ["diff", "--name-only", "--no-renames", `${revision}..${headRevision}`]);
}

// 逐 commit 列出 baseline..HEAD 中每个提交触碰的路径,供"有效源码落后"计数:
// \x01 前缀作 commit 分隔哨兵,避免 40 位 hex 路径名的歧义;merge commit 默认不列文件,视为无自身变更。
export function readCommitsWithChangedPathsSince(
  rootDir: string,
  revision: string,
  headRevision: string
): Array<{ revision: string; paths: string[] }> | null {
  if (!gitCommitExists(rootDir, revision)) {
    return null;
  }
  const output = runGitSafe(rootDir, ["log", "--format=%x01%H", "--name-only", "--no-renames", `${revision}..${headRevision}`]);
  if (output === null) {
    return null;
  }
  const commits: Array<{ revision: string; paths: string[] }> = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("\u0001")) {
      commits.push({ revision: trimmed.slice(1), paths: [] });
    } else if (commits.length > 0) {
      commits[commits.length - 1]!.paths.push(trimmed);
    }
  }
  return commits;
}

export function canAdvanceRevisions(gitState: GitState): { ok: true } | { ok: false; reason: string } {
  if (!gitState.available || !gitState.headRevision) {
    return { ok: false, reason: gitState.degradedReason ?? "git 状态不可用。" };
  }
  if (gitState.inProgressOperation) {
    return { ok: false, reason: `${gitState.inProgressOperation} 进行中，不推进 revision。` };
  }
  return { ok: true };
}

function isGitRepository(rootDir: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

function runGitSafe(rootDir: string, args: string[]): string | null {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

function readPathList(rootDir: string, args: string[]): string[] {
  const output = runGitSafe(rootDir, args);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readBehindCount(rootDir: string, baselineRevision: string, headRevision: string): number | null {
  const output = runGitSafe(rootDir, ["rev-list", "--count", `${baselineRevision}..${headRevision}`]);
  if (!output) {
    return null;
  }
  const count = Number.parseInt(output, 10);
  return Number.isNaN(count) ? null : count;
}

function detectInProgressOperation(rootDir: string): "merge" | "rebase" | "cherry-pick" | null {
  const gitDir = runGitSafe(rootDir, ["rev-parse", "--git-dir"]);
  if (!gitDir) {
    return null;
  }
  const resolvedGitDir = path.resolve(rootDir, gitDir);
  if (fs.existsSync(path.join(resolvedGitDir, "rebase-merge")) || fs.existsSync(path.join(resolvedGitDir, "rebase-apply"))) {
    return "rebase";
  }
  if (fs.existsSync(path.join(resolvedGitDir, "MERGE_HEAD"))) {
    return "merge";
  }
  if (fs.existsSync(path.join(resolvedGitDir, "CHERRY_PICK_HEAD"))) {
    return "cherry-pick";
  }
  return null;
}
