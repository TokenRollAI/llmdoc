import fs from "node:fs";

import { DocumentImpact, GitState, MetaLedger, ParsedDocument, WorkspaceData } from "../types.js";
import { canAdvanceRevisions, gitCommitExists, readChangedPathsSince, readGitState } from "./git.js";
import { normalizeRepoRelativePath } from "./fs.js";
import { matchesCodePathPattern } from "./search.js";

export interface ScopeFilter {
  topics: Set<string>;
  documentPaths: Set<string>;
}

export interface DeltaState {
  git: GitState;
  impacts: DocumentImpact[];
  needsReview: ParsedDocument[];
  dirtyDocuments: ParsedDocument[];
  unmappedCommittedPaths: string[];
  unmappedDirtyPaths: string[];
  suggestedMode: "light" | "deep";
  reasons: string[];
  scopedDocuments: ParsedDocument[];
}

export interface GrowthState {
  currentDocumentCount: number;
  currentTotalEstimatedTokens: number;
  baselineDocumentCount: number | null;
  baselineTotalEstimatedTokens: number | null;
  documentDelta: number | null;
  tokenDelta: number | null;
  exceedsGate: boolean;
}

export function analyzeDelta(workspace: WorkspaceData, scope?: ScopeFilter): DeltaState {
  const git = readWorkspaceGitState(workspace);
  const ignorePatterns = loadIgnorePatterns(workspace.rootDir);
  const isSurface = (repoRelativePath: string): boolean => isImplementationSurfacePath(repoRelativePath, ignorePatterns);
  const scopedDocuments = applyScope(workspace.documents, scope);
  const dirtyPaths = uniquePaths([...git.stagedPaths, ...git.unstagedPaths, ...git.untrackedPaths].filter(isSurface));
  const invalidRevisionDocuments: ParsedDocument[] = [];
  const invalidRevisionReasons: string[] = [];
  const changedPathsByRevision = new Map<string, string[]>();
  const commitExistsByRevision = new Map<string, boolean>();
  const cachedCommitExists = (revision: string): boolean => {
    const cached = commitExistsByRevision.get(revision);
    if (cached !== undefined) {
      return cached;
    }
    const exists = gitCommitExists(workspace.rootDir, revision);
    commitExistsByRevision.set(revision, exists);
    return exists;
  };

  const directImpacts: DocumentImpact[] = scopedDocuments
    .map((document): DocumentImpact => {
      const validatedRevision = workspace.meta?.documents[document.llmdocPath]?.validatedRevision ?? null;
      const revisionInvalid =
        !validatedRevision ||
        !git.headRevision ||
        !cachedCommitExists(validatedRevision);
      if (revisionInvalid) {
        invalidRevisionDocuments.push(document);
        invalidRevisionReasons.push(
          !validatedRevision
            ? `文档 ${document.llmdocPath} 缺少 validatedRevision`
            : `文档 ${document.llmdocPath} 的 validatedRevision 不存在于当前 git 历史: ${validatedRevision}`
        );
      }
      const changedCommittedPaths =
        !revisionInvalid && git.headRevision && validatedRevision !== git.headRevision
          ? getChangedPathsForRevision(workspace.rootDir, validatedRevision, git.headRevision, changedPathsByRevision).filter(
              (filePath) => isSurface(filePath) && documentMatchesPath(document, filePath)
            )
          : [];
      const dirtyDocumentPaths = dirtyPaths.filter((filePath) => documentMatchesPath(document, filePath));
      return {
        document,
        changedCommittedPaths,
        dirtyPaths: dirtyDocumentPaths,
        needsReviewBecauseOf: revisionInvalid ? ["validatedRevision invalid"] : []
      };
    })
    .filter(
      (impact) =>
        impact.changedCommittedPaths.length > 0 ||
        impact.dirtyPaths.length > 0 ||
        impact.needsReviewBecauseOf.includes("validatedRevision invalid")
    );

  const directMap = new Map(directImpacts.map((impact) => [impact.document.llmdocPath, impact]));
  const reverseRequires = buildReverseRequires(workspace.documents);
  const needsReviewMap = new Map<string, ParsedDocument>();

  for (const impact of directImpacts) {
    for (const dependent of reverseRequires.get(impact.document.llmdocPath) ?? []) {
      if (!scopedDocuments.some((document) => document.llmdocPath === dependent.llmdocPath)) {
        continue;
      }
      if (!directMap.has(dependent.llmdocPath)) {
        needsReviewMap.set(dependent.llmdocPath, dependent);
      }
      const existing = directMap.get(dependent.llmdocPath);
      if (existing) {
        existing.needsReviewBecauseOf.push(impact.document.llmdocPath);
      }
    }
  }

  const needsReview = [...needsReviewMap.values()].sort((left, right) => left.llmdocPath.localeCompare(right.llmdocPath));
  const dirtyDocuments = directImpacts.filter((impact) => impact.dirtyPaths.length > 0).map((impact) => impact.document);
  const baselineCommittedPaths = git.committedChangedPaths.filter(isSurface);
  const unmappedCommittedPaths = baselineCommittedPaths.filter(
    (filePath) => !workspace.documents.some((document) => documentMatchesPath(document, filePath))
  );
  const unmappedDirtyPaths = dirtyPaths.filter(
    (filePath) => !workspace.documents.some((document) => documentMatchesPath(document, filePath))
  );

  const reasons: string[] = [];
  if (!git.available || git.degradedReason) {
    reasons.push(git.degradedReason ?? "git 状态不可用");
  }
  if (invalidRevisionReasons.length > 0) {
    reasons.push(...invalidRevisionReasons);
  }
  if (unmappedCommittedPaths.length > 0 || unmappedDirtyPaths.length > 0) {
    reasons.push("存在未映射代码路径");
  }
  if (needsReview.length > 0) {
    reasons.push("存在 requires 反向一跳需复核文档");
  }
  if (directImpacts.length > 8) {
    reasons.push("受影响文档过多，建议 deep");
  }
  if (dirtyDocuments.length > 0) {
    reasons.push("存在未提交 dirty 关联代码");
  }
  const suggestedMode: "light" | "deep" = reasons.some((reason) =>
    ["未映射", "需复核", "过多", "dirty", "不可用", "不存在于当前 git 历史", "validatedRevision", "缺少"].some((keyword) =>
      reason.includes(keyword)
    )
  )
    ? "deep"
    : "light";

  return {
    git,
    impacts: directImpacts.sort((left, right) => left.document.llmdocPath.localeCompare(right.document.llmdocPath)),
    needsReview,
    dirtyDocuments: dirtyDocuments.sort((left, right) => left.llmdocPath.localeCompare(right.llmdocPath)),
    unmappedCommittedPaths,
    unmappedDirtyPaths,
    suggestedMode,
    reasons,
    scopedDocuments
  };
}

export function readWorkspaceGitState(workspace: WorkspaceData): GitState {
  return readGitState(workspace.rootDir, workspace.meta?.baseline.revision ?? null);
}

export function parseScope(values: string[] | undefined, workspace: WorkspaceData): ScopeFilter | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const topics = new Set<string>();
  const documentPaths = new Set<string>();
  for (const value of values) {
    const raw = value.trim();
    if (workspace.topics.has(raw)) {
      topics.add(raw);
      continue;
    }
    const normalized = normalizeRepoRelativePath(raw.startsWith("llmdoc/") ? raw : `llmdoc/${raw}`).slice("llmdoc/".length);
    if (workspace.topics.has(normalized)) {
      topics.add(normalized);
      continue;
    }
    if (!workspace.documentsByLlmdocPath.has(normalized)) {
      throw new Error(`scope 未命中任何 topic 或文档: ${raw}`);
    }
    documentPaths.add(normalized);
  }
  return { topics, documentPaths };
}

export function computeGrowthState(workspace: WorkspaceData): GrowthState {
  const currentDocumentCount = workspace.documents.length;
  const currentTotalEstimatedTokens = workspace.documents.reduce((sum, document) => sum + document.estimatedTokens, 0);
  const baselineDocumentCount = workspace.meta?.convergence.documentCount ?? null;
  const baselineTotalEstimatedTokens = workspace.meta?.convergence.totalEstimatedTokens ?? null;
  const documentDelta = baselineDocumentCount === null ? null : currentDocumentCount - baselineDocumentCount;
  const tokenDelta = baselineTotalEstimatedTokens === null ? null : currentTotalEstimatedTokens - baselineTotalEstimatedTokens;
  const exceedsGate = tokenDelta !== null ? tokenDelta > Math.max(500, Math.round((baselineTotalEstimatedTokens ?? 0) * 0.2)) : false;
  return {
    currentDocumentCount,
    currentTotalEstimatedTokens,
    baselineDocumentCount,
    baselineTotalEstimatedTokens,
    documentDelta,
    tokenDelta,
    exceedsGate
  };
}

export function updateMetaRevisions(input: {
  workspace: WorkspaceData;
  llmdocPaths: string[];
  updateAll: boolean;
}): { meta: MetaLedger; updatedPaths: string[] } {
  const { workspace, llmdocPaths, updateAll } = input;
  if (!workspace.meta) {
    throw new Error("缺少 meta.json");
  }
  const git = readWorkspaceGitState(workspace);
  const advance = canAdvanceRevisions(git);
  if (!advance.ok) {
    throw new Error(advance.reason);
  }

  const targetPaths = updateAll ? workspace.documents.map((document) => document.llmdocPath) : llmdocPaths;
  const ignorePatterns = loadIgnorePatterns(workspace.rootDir);
  const dirtyPaths = uniquePaths([...git.stagedPaths, ...git.unstagedPaths, ...git.untrackedPaths]).filter((filePath) =>
    isImplementationSurfacePath(filePath, ignorePatterns)
  );
  // 只有映射到某份文档 code.paths 的 dirty 变更才阻塞推进;
  // 无关的 untracked/dirty 文件不影响 revision 的真实性,不应拦路。
  const blocked = targetPaths.filter((docPath) => {
    const document = workspace.documentsByLlmdocPath.get(docPath);
    return document ? dirtyPaths.some((filePath) => documentMatchesPath(document, filePath)) : false;
  });
  if (blocked.length > 0) {
    throw new Error(
      updateAll
        ? `全量 fingerprint 时以下文档关联代码存在 dirty 变更，不能伪造 revision: ${blocked.join(", ")}`
        : `以下文档关联代码存在 dirty 变更，不能伪造 revision: ${blocked.join(", ")}`
    );
  }

  const nextMeta: MetaLedger = structuredClone(workspace.meta);
  // 文档已被删除的孤儿 ledger 条目在此顺带清理:
  // recorder 不允许手编辑 meta.json,删除文档后的 ledger 收敛只能由 CLI 完成。
  for (const docPath of Object.keys(nextMeta.documents)) {
    if (!workspace.documentsByLlmdocPath.has(docPath)) {
      delete nextMeta.documents[docPath];
    }
  }
  for (const docPath of targetPaths) {
    nextMeta.documents[docPath] = {
      validatedRevision: git.headRevision!
    };
  }
  if (updateAll) {
    nextMeta.baseline.revision = git.headRevision!;
    nextMeta.baseline.verifiedAt = new Date().toISOString();
  }
  return { meta: nextMeta, updatedPaths: targetPaths.slice().sort() };
}

export function writeMeta(metaPath: string, meta: MetaLedger): void {
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

function applyScope(documents: ParsedDocument[], scope: ScopeFilter | undefined): ParsedDocument[] {
  if (!scope) {
    return documents.slice();
  }
  return documents.filter((document) => {
    if (document.topic && scope.topics.has(document.topic)) {
      return true;
    }
    return scope.documentPaths.has(document.llmdocPath);
  });
}

function documentMatchesPath(document: ParsedDocument, repoRelativePath: string): boolean {
  return (document.frontmatter.code?.paths ?? []).some((pattern) => matchesCodePathPattern(pattern, repoRelativePath));
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)].sort();
}

const NON_IMPLEMENTATION_BASENAMES = new Set([
  ".gitignore",
  ".gitattributes",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum"
]);

const ignorePatternsCache = new Map<string, string[]>();

// .llmdocignore:仓库根的可选文件,每行一个 minimatch pattern(# 开头为注释),
// 匹配的路径不参与 unmapped/dirty 信号(本地运行时文件、生成物等非知识面路径)。
export function loadIgnorePatterns(rootDir: string): string[] {
  const cached = ignorePatternsCache.get(rootDir);
  if (cached) {
    return cached;
  }
  const ignoreFile = `${rootDir}/.llmdocignore`;
  let patterns: string[] = [];
  try {
    patterns = fs
      .readFileSync(ignoreFile, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.replace(/^\.\//, "").replace(/\/$/, "/**"));
  } catch {
    patterns = [];
  }
  ignorePatternsCache.set(rootDir, patterns);
  return patterns;
}

function isImplementationSurfacePath(repoRelativePath: string, ignorePatterns: string[] = []): boolean {
  if (repoRelativePath.startsWith("llmdoc/") || repoRelativePath.startsWith(".llmdoc-tmp/")) {
    return false;
  }
  const basename = repoRelativePath.split("/").pop() ?? repoRelativePath;
  if (NON_IMPLEMENTATION_BASENAMES.has(basename)) {
    return false;
  }
  return !ignorePatterns.some((pattern) => matchesCodePathPattern(pattern, repoRelativePath));
}

function buildReverseRequires(documents: ParsedDocument[]): Map<string, ParsedDocument[]> {
  const mapping = new Map<string, ParsedDocument[]>();
  for (const document of documents) {
    for (const requirement of document.frontmatter.relations?.requires ?? []) {
      const bucket = mapping.get(requirement) ?? [];
      bucket.push(document);
      mapping.set(requirement, bucket);
    }
  }
  return mapping;
}

function getChangedPathsForRevision(
  rootDir: string,
  revision: string,
  headRevision: string,
  cache: Map<string, string[]>
): string[] {
  const cached = cache.get(revision);
  if (cached) {
    return cached;
  }
  const paths = readChangedPathsSince(rootDir, revision, headRevision);
  cache.set(revision, paths);
  return paths;
}
