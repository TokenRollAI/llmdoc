import fs from "node:fs";
import path from "node:path";

import { isDirectTopicDirectory, parseDocTargetShape, validateMoveTargetShape } from "../lib/doc-shape.js";
import { CliError } from "../lib/errors.js";
import { findProjectRoot, normalizeRepoRelativePath, repoPath, resolveInsideRoot } from "../lib/fs.js";
import { gitMove, gitRestorePaths } from "../lib/git.js";
import { MoveMapping, updateDocumentForMove, writeFileIfChanged } from "../lib/rewrite.js";
import { loadWorkspace } from "../lib/workspace.js";
import { LLMDOC_CONFIG_FILENAME, rewriteStartupPreloadForMove } from "../lib/config.js";
import { isSourceRef } from "../lib/source-id.js";
import { MetaLedger, ParsedDocument } from "../types.js";

interface MoveOptions {
  cwd: string;
  from: string;
  to: string;
  json?: boolean;
}

export function runMove(options: MoveOptions): unknown {
  if (isSourceRef(options.from) || isSourceRef(options.to)) {
    throw new CliError("External source documents (@...) are read-only and cannot be moved with mv.");
  }
  const rootDir = findProjectRoot(options.cwd);
  const fromRepoPath = normalizeRepoRelativePath(options.from.startsWith("llmdoc/") ? options.from : `llmdoc/${options.from}`);
  const toRepoPath = normalizeRepoRelativePath(options.to.startsWith("llmdoc/") ? options.to : `llmdoc/${options.to}`);
  const toFirstSegment = toRepoPath.startsWith("llmdoc/") ? toRepoPath.slice("llmdoc/".length).split("/")[0] : "";
  if (toFirstSegment?.startsWith("@")) {
    throw new CliError(`Local topic names cannot start with "@", which is reserved for external sources: ${toFirstSegment}`);
  }
  const fromAbsolutePath = resolveInsideRoot(rootDir, fromRepoPath);

  if (!fromRepoPath.startsWith("llmdoc/") || !toRepoPath.startsWith("llmdoc/")) {
    throw new CliError("mv supports moves only within llmdoc/.");
  }
  if (fromRepoPath === "llmdoc/meta.json" || toRepoPath === "llmdoc/meta.json") {
    throw new CliError("mv cannot move meta.json.");
  }

  const fromStats = fs.statSync(fromAbsolutePath);
  const beforeWorkspace = loadWorkspace(rootDir);
  if (fromStats.isDirectory()) {
    if (!isDirectTopicDirectory(fromRepoPath) || !isDirectTopicDirectory(toRepoPath)) {
      throw new CliError("Topic renames must use llmdoc/<topic> -> llmdoc/<topic>.");
    }
  } else {
    if (!fromRepoPath.endsWith(".mdx") || !toRepoPath.endsWith(".mdx")) {
      throw new CliError("mv can move only .mdx documents.");
    }
    const fromDocument = beforeWorkspace.documents.find((document) => document.repoPath === fromRepoPath);
    if (!fromDocument) {
      throw new CliError("mv can move only indexed llmdoc documents.");
    }
    const targetShape = parseDocTargetShape(toRepoPath);
    validateMoveTargetShape(targetShape);
  }

  const toAbsolutePath = resolveInsideRoot(rootDir, toRepoPath, { allowMissing: true });
  if (fs.existsSync(toAbsolutePath)) {
    throw new CliError(`Target already exists: ${toRepoPath}`);
  }

  const mapping = buildMoveMapping(beforeWorkspace.documents, beforeWorkspace.llmdocDir, fromAbsolutePath, toAbsolutePath);
  const configRewrite = beforeWorkspace.llmdocConfig.config
    ? rewriteStartupPreloadForMove(beforeWorkspace.llmdocConfig.config, mapping)
    : { config: null, changed: false };
  const configPath = path.join(rootDir, LLMDOC_CONFIG_FILENAME);
  const originalConfig = configRewrite.changed ? fs.readFileSync(configPath, "utf8") : null;
  // 目标 topic 目录不存在时自动创建(topic 即纯目录,没有入口节点前置要求)。
  fs.mkdirSync(path.dirname(toAbsolutePath), { recursive: true });
  gitMove(rootDir, fromRepoPath, toRepoPath);

  const movedAfterPaths = new Map<string, string>();
  for (const item of mapping) {
    movedAfterPaths.set(item.oldLlmdocPath, path.join(beforeWorkspace.llmdocDir, item.newLlmdocPath));
  }

  const documentTargets = new Set<string>();
  for (const document of beforeWorkspace.documents) {
    if (documentTouchesMove(document, mapping)) {
      documentTargets.add(document.absolutePath);
    }
  }
  for (const nextAbsolute of movedAfterPaths.values()) {
    documentTargets.add(nextAbsolute);
  }

  try {
    for (const document of beforeWorkspace.documents) {
      if (!documentTouchesMove(document, mapping)) {
        continue;
      }

      const nextAbsolute = movedAfterPaths.get(document.llmdocPath) ?? document.absolutePath;
      const nextContent = updateDocumentForMove(document, mapping);
      writeFileIfChanged(nextAbsolute, nextContent);
    }

    const refreshedWorkspace = loadWorkspace(rootDir);
    if (refreshedWorkspace.meta) {
      const nextMeta = rewriteMeta(refreshedWorkspace.meta, mapping);
      fs.writeFileSync(refreshedWorkspace.metaPath, `${JSON.stringify(nextMeta, null, 2)}\n`);
    }
    if (configRewrite.changed && configRewrite.config) {
      fs.writeFileSync(configPath, `${JSON.stringify(configRewrite.config, null, 2)}\n`);
    }
  } catch (error) {
    const rolledBack = rollbackMove(rootDir, toAbsolutePath, configPath, originalConfig);
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(
      rolledBack
        ? `Reference rewriting failed during mv; llmdoc/ was rolled back to its previous state: ${reason}`
        : `Reference rewriting failed during mv and automatic rollback did not complete. Inspect git status -- llmdoc/ llmdoc.config.json and recover manually: ${reason}`
    );
  }

  if (options.json) {
    return {
      moved: {
        from: fromRepoPath,
        to: toRepoPath
      },
      rewrittenConfig: configRewrite.changed,
      rewrittenDocuments: [...documentTargets].map((absolutePath) => repoPath(rootDir, absolutePath)).sort()
    };
  }
  return `moved: ${fromRepoPath} -> ${toRepoPath}${configRewrite.changed ? "; updated llmdoc.config.json startup preload" : ""}`;
}

function buildMoveMapping(
  documents: ParsedDocument[],
  llmdocDir: string,
  fromAbsolutePath: string,
  toAbsolutePath: string
): MoveMapping[] {
  const mapping: MoveMapping[] = [];
  // llmdocDir 与待映射路径可能一边是 realpath 一边不是(如 macOS 的 /tmp symlink),
  // 因此对两种 base 都尝试求相对路径。
  const llmdocDirBases = [...new Set([llmdocDir, fs.realpathSync(llmdocDir)])];
  const toLlmdocPath = (absolutePath: string): string => {
    for (const base of llmdocDirBases) {
      const relative = path.relative(base, absolutePath);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative.replaceAll(path.sep, "/");
      }
    }
    throw new CliError(`Unable to derive an llmdoc-relative path from: ${absolutePath}`);
  };
  const fromPathIsDirectory = fs.statSync(fromAbsolutePath).isDirectory();

  if (fromPathIsDirectory) {
    const fromBase = fromAbsolutePath;
    for (const document of documents) {
      if (document.absolutePath === fromBase || document.absolutePath.startsWith(`${fromBase}${path.sep}`)) {
        const suffix = path.relative(fromBase, document.absolutePath);
        const nextAbsolute = path.join(toAbsolutePath, suffix);
        mapping.push({
          oldLlmdocPath: toLlmdocPath(document.absolutePath),
          newLlmdocPath: toLlmdocPath(nextAbsolute)
        });
      }
    }
  } else {
    mapping.push({
      oldLlmdocPath: toLlmdocPath(fromAbsolutePath),
      newLlmdocPath: toLlmdocPath(toAbsolutePath)
    });
  }

  return mapping.sort((left, right) => right.oldLlmdocPath.length - left.oldLlmdocPath.length);
}

function rollbackMove(rootDir: string, toAbsolutePath: string, configPath: string, originalConfig: string | null): boolean {
  try {
    fs.rmSync(toAbsolutePath, { recursive: true, force: true });
    gitRestorePaths(rootDir, ["llmdoc"]);
    if (originalConfig !== null) {
      fs.writeFileSync(configPath, originalConfig);
    }
    return true;
  } catch {
    return false;
  }
}

function documentTouchesMove(document: ParsedDocument, mapping: MoveMapping[]): boolean {
  if (mapping.some((item) => document.llmdocPath === item.oldLlmdocPath)) {
    return true;
  }

  const relationTargets = [
    ...(document.frontmatter.relations?.requires ?? []),
    ...(document.frontmatter.relations?.related ?? [])
  ];
  if (relationTargets.some((target) => mapping.some((item) => target === item.oldLlmdocPath || target.startsWith(`${item.oldLlmdocPath}/`)))) {
    return true;
  }

  return document.links.some((target) => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(document.llmdocPath), target));
    return mapping.some((item) => resolved === item.oldLlmdocPath || resolved.startsWith(`${item.oldLlmdocPath}/`));
  });
}

function rewriteMeta(meta: MetaLedger, mapping: MoveMapping[]): MetaLedger {
  const nextDocuments: MetaLedger["documents"] = {};
  for (const [docPath, value] of Object.entries(meta.documents)) {
    const rewrittenPath = rewritePath(docPath, mapping);
    nextDocuments[rewrittenPath] = value;
  }
  return {
    ...meta,
    documents: nextDocuments
  };
}

function rewritePath(input: string, mapping: MoveMapping[]): string {
  for (const item of mapping) {
    if (input === item.oldLlmdocPath) {
      return item.newLlmdocPath;
    }
    if (input.startsWith(`${item.oldLlmdocPath}/`)) {
      return `${item.newLlmdocPath}${input.slice(item.oldLlmdocPath.length)}`;
    }
  }
  return input;
}
