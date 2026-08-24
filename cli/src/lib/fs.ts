import fs from "node:fs";
import path from "node:path";

import { CliError } from "./errors.js";

export function findProjectRoot(startDir: string): string {
  const found = findProjectRootOrNull(startDir);
  if (found) {
    return found;
  }
  throw new CliError("未找到 llmdoc/ 目录，请在仓库内运行该命令。", 2);
}

export function findProjectRootOrNull(startDir: string): string | null {
  const start = path.resolve(startDir);
  const gitRoot = findNearestGitRootOrNull(start);

  if (gitRoot) {
    return isDirectory(path.join(gitRoot, "llmdoc")) ? gitRoot : null;
  }

  // Git 是 llmdoc 有效性与 delta 语义的基础；这里只为仓库初始化前的
  // 临时目录保留兼容回退。存在 Git 边界时绝不能越界命中同级仓库。
  let current = start;
  while (true) {
    if (isDirectory(path.join(current, "llmdoc"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function findNearestGitRootOrNull(startDir: string): string | null {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

export function normalizeRepoRelativePath(input: string): string {
  const normalized = input.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    throw new CliError(`非法路径: ${input}`);
  }
  const parts = normalized.split("/").filter((part) => part !== ".");
  if (parts.length === 0) {
    throw new CliError(`非法路径: ${input}`);
  }
  if (parts.some((part) => part === ".." || part === "")) {
    throw new CliError(`路径必须是仓库内规范化相对路径: ${input}`);
  }
  return parts.join("/");
}

export function resolveInsideRoot(rootDir: string, repoRelativePath: string, options?: { allowMissing?: boolean }): string {
  const safeRelativePath = normalizeRepoRelativePath(repoRelativePath);
  const candidate = path.join(rootDir, safeRelativePath);
  const rootRealPath = fs.realpathSync(rootDir);
  const nearestExistingAncestor = findNearestExistingAncestor(candidate);
  const ancestorRealPath = fs.realpathSync(nearestExistingAncestor);

  if (!isWithinRoot(rootRealPath, ancestorRealPath)) {
    throw new CliError(`路径越界或经由符号链接逃逸: ${repoRelativePath}`);
  }

  if (fs.existsSync(candidate)) {
    const candidateRealPath = fs.realpathSync(candidate);
    if (!isWithinRoot(rootRealPath, candidateRealPath)) {
      throw new CliError(`路径越界或经由符号链接逃逸: ${repoRelativePath}`);
    }
    return candidateRealPath;
  }

  if (options?.allowMissing) {
    return candidate;
  }

  throw new CliError(`路径不存在: ${repoRelativePath}`);
}

export function isWithinRoot(rootRealPath: string, candidateRealPath: string): boolean {
  return candidateRealPath === rootRealPath || candidateRealPath.startsWith(`${rootRealPath}${path.sep}`);
}

export function toPosixRelative(fromDir: string, toPath: string): string {
  return path.relative(fromDir, toPath).replaceAll(path.sep, "/");
}

export function ensureDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function repoPath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).replaceAll(path.sep, "/");
}

function findNearestExistingAncestor(candidatePath: string): string {
  let current = path.resolve(path.dirname(candidatePath));
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return current;
}
