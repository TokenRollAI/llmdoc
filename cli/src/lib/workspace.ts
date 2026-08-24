import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import { ParsedDocument, ValidationIssue, WorkspaceData, MetaLedger, DocumentFrontmatter } from "../types.js";
import { DOC_LINE_WARNING_LIMIT } from "./constants.js";
import { CliError } from "./errors.js";
import { estimateTokens, extractCodeRefs, extractLinks, extractTitle, resolveDocLink, stripMarkdownLiterals, validateCodeRefTags } from "./markdown.js";
import { assertDocKindMatchesShape, parseDocTargetShape } from "./doc-shape.js";
import { normalizeRepoRelativePath, repoPath, resolveInsideRoot } from "./fs.js";
import { gitCommitExists } from "./git.js";
import { validateDocFrontmatter, validateMeta } from "./schema.js";

export function loadWorkspace(rootDir: string): WorkspaceData {
  const configuredLlmdocDir = path.join(rootDir, "llmdoc");
  if (!fs.existsSync(configuredLlmdocDir) || !fs.statSync(configuredLlmdocDir).isDirectory()) {
    throw new CliError("仓库内不存在 llmdoc/ 目录。", 2);
  }
  resolveInsideRoot(rootDir, "llmdoc");
  const llmdocDir = configuredLlmdocDir;

  const preloadIssues: ValidationIssue[] = [];
  const documents = scanDocuments(rootDir, llmdocDir, preloadIssues);
  const documentsByLlmdocPath = new Map(documents.map((document) => [document.llmdocPath, document]));
  const topics = new Map<string, ParsedDocument[]>();
  const rootSingletons: ParsedDocument[] = [];

  for (const document of documents) {
    if (document.topic) {
      const bucket = topics.get(document.topic) ?? [];
      bucket.push(document);
      topics.set(document.topic, bucket);
    } else {
      rootSingletons.push(document);
    }
  }

  for (const docs of topics.values()) {
    docs.sort((left, right) => left.llmdocPath.localeCompare(right.llmdocPath));
  }
  rootSingletons.sort((left, right) => left.llmdocPath.localeCompare(right.llmdocPath));

  const metaPath = path.join(llmdocDir, "meta.json");
  const meta = loadMeta(metaPath, preloadIssues);

  return {
    rootDir,
    llmdocDir,
    metaPath,
    documents,
    documentsByLlmdocPath,
    topics,
    rootSingletons,
    meta,
    preloadIssues
  };
}

function scanDocuments(rootDir: string, llmdocDir: string, preloadIssues: ValidationIssue[]): ParsedDocument[] {
  const results: ParsedDocument[] = [];

  walk(llmdocDir, (absolutePath) => {
    const repoRelativePath = repoPath(rootDir, absolutePath);
    if (!absolutePath.endsWith(".mdx")) {
      if (absolutePath !== path.join(llmdocDir, "meta.json")) {
        preloadIssues.push({
          severity: "error",
          code: "file.extension.invalid",
          path: repoRelativePath,
          message: "llmdoc/ 下仅允许 .mdx 文档与根级唯一 meta.json。"
        });
      }
      return;
    }

    const raw = fs.readFileSync(absolutePath, "utf8");
    let parsed;
    try {
      parsed = matter(raw);
    } catch (error) {
      preloadIssues.push({
        severity: "error",
        code: "frontmatter.parse",
        path: repoRelativePath,
        message: `front matter 解析失败: ${(error as Error).message}`
      });
      return;
    }
    const frontmatter = parsed.data as DocumentFrontmatter;
    const llmdocPath = repoPath(llmdocDir, absolutePath);
    const segments = llmdocPath.split("/");

    results.push({
      absolutePath,
      repoPath: repoPath(rootDir, absolutePath),
      llmdocPath,
      topic: segments.length > 1 ? segments[0] ?? null : null,
      basename: path.basename(absolutePath),
      frontmatter,
      body: parsed.content.trim(),
      raw,
      title: extractTitle(parsed.content),
      links: extractLinks(parsed.content),
      codeRefs: extractCodeRefs(parsed.content),
      estimatedTokens: estimateTokens(parsed.content),
      lineCount: raw.split(/\r?\n/).length
    });
  });

  results.sort((left, right) => left.llmdocPath.localeCompare(right.llmdocPath));
  return results;
}

function walk(currentDir: string, visitor: (absolutePath: string) => void): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, visitor);
    } else if (entry.isFile()) {
      visitor(absolutePath);
    }
  }
}

function loadMeta(metaPath: string, preloadIssues: ValidationIssue[]): MetaLedger | null {
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  let raw: MetaLedger;
  try {
    raw = JSON.parse(fs.readFileSync(metaPath, "utf8")) as MetaLedger;
  } catch (error) {
    preloadIssues.push({
      severity: "error",
      code: "meta.parse",
      path: "llmdoc/meta.json",
      message: `meta.json 解析失败: ${(error as Error).message}`
    });
    return null;
  }
  const errors = validateMeta(raw);
  if (errors.length > 0) {
    for (const error of errors) {
      preloadIssues.push({
        severity: "error",
        code: "meta.invalid",
        path: "llmdoc/meta.json",
        message: `meta.json 非法: ${error}`
      });
    }
    return null;
  }
  return raw;
}

export function validateWorkspace(workspace: WorkspaceData): ValidationIssue[] {
  const issues: ValidationIssue[] = [...workspace.preloadIssues];
  const seenDocPaths = new Set<string>();

  if (!workspace.meta) {
    issues.push({
      severity: "error",
      code: "meta.missing",
      path: "llmdoc/meta.json",
      message: "缺少 llmdoc/meta.json。"
    });
  }

  for (const document of workspace.documents) {
    seenDocPaths.add(document.llmdocPath);
    const frontmatterErrors = validateDocFrontmatter(document.frontmatter);
    for (const error of frontmatterErrors) {
      issues.push({
        severity: "error",
        code: "frontmatter.invalid",
        path: document.repoPath,
        message: `front matter 非法: ${error}`
      });
    }

    try {
      const shape = parseDocTargetShape(document.repoPath);
      assertDocKindMatchesShape(shape);
    } catch (error) {
      issues.push({
        severity: "error",
        code: "doc.shape.invalid",
        path: document.repoPath,
        message: (error as Error).message
      });
    }

    const depth = document.llmdocPath.split("/").length;
    if (depth > 2) {
      issues.push({
        severity: "error",
        code: "hierarchy.nested",
        path: document.repoPath,
        message: "topic 下不允许继续嵌套子目录。"
      });
    }

    const mdxBodyErrors = validateMdxBody(document.body);
    for (const message of mdxBodyErrors) {
      issues.push({
        severity: "error",
        code: "mdx.syntax.forbidden",
        path: document.repoPath,
        message
      });
    }

    for (const relationPath of document.frontmatter.relations?.requires ?? []) {
      const normalizedRelation = validateLlmdocRelativePath(relationPath);
      if (!normalizedRelation.ok) {
        issues.push({
          severity: "error",
          code: "relations.requires.invalid-path",
          path: document.repoPath,
          message: normalizedRelation.message
        });
      } else if (!workspace.documentsByLlmdocPath.has(normalizedRelation.value)) {
        issues.push({
          severity: "error",
          code: "relations.requires.missing",
          path: document.repoPath,
          message: `requires 指向不存在的文档: ${relationPath}`
        });
      }
    }

    for (const relationPath of document.frontmatter.relations?.related ?? []) {
      const normalizedRelation = validateLlmdocRelativePath(relationPath);
      if (!normalizedRelation.ok) {
        issues.push({
          severity: "error",
          code: "relations.related.invalid-path",
          path: document.repoPath,
          message: normalizedRelation.message
        });
      } else if (!workspace.documentsByLlmdocPath.has(normalizedRelation.value)) {
        issues.push({
          severity: "error",
          code: "relations.related.missing",
          path: document.repoPath,
          message: `related 指向不存在的文档: ${relationPath}`
        });
      }
    }

    for (const linkTarget of document.links) {
      const resolved = resolveDocLink(document.llmdocPath, linkTarget);
      const normalizedLink = validateLlmdocRelativePath(resolved);
      if (!normalizedLink.ok) {
        issues.push({
          severity: "error",
          code: "link.invalid-path",
          path: document.repoPath,
          message: `正文链接非法: ${linkTarget} (${normalizedLink.message})`
        });
      } else if (!workspace.documentsByLlmdocPath.has(normalizedLink.value)) {
        issues.push({
          severity: "error",
          code: "link.missing",
          path: document.repoPath,
          message: `正文链接悬空: ${linkTarget}`
        });
      }
    }

    for (const codeRef of document.codeRefs) {
      const normalized = validateRepoPath(workspace.rootDir, codeRef.path);
      if (!normalized.ok) {
        issues.push({
          severity: "error",
          code: "coderef.path.invalid",
          path: document.repoPath,
          message: normalized.message
        });
      } else if (!fs.existsSync(normalized.absolutePath)) {
        issues.push({
          severity: "error",
          code: "coderef.path.missing",
          path: document.repoPath,
          message: `CodeRef path 不存在: ${codeRef.path}`
        });
      }
    }

    for (const codePath of document.frontmatter.code?.paths ?? []) {
      const normalized = validateCodePathPattern(workspace.rootDir, codePath);
      if (!normalized.ok) {
        issues.push({
          severity: "error",
          code: "code.paths.invalid",
          path: document.repoPath,
          message: normalized.message
        });
      } else if (!normalized.isGlob && !fs.existsSync(normalized.absolutePath)) {
        issues.push({
          severity: "error",
          code: "code.paths.missing",
          path: document.repoPath,
          message: `code.paths 指向不存在的路径: ${codePath}`
        });
      }
    }

    if (document.lineCount > DOC_LINE_WARNING_LIMIT) {
      issues.push({
        severity: "warning",
        code: "size.line-warning",
        path: document.repoPath,
        message: `文档 ${document.lineCount} 行，超过建议上限 ${DOC_LINE_WARNING_LIMIT} 行。`
      });
    }
  }

  for (const [topic, docs] of workspace.topics) {
    if (docs.length === 0) {
      issues.push({
        severity: "warning",
        code: "topic.empty",
        path: `llmdoc/${topic}`,
        message: "topic 目录为空。"
      });
    }
  }

  if (workspace.meta) {
    if (!gitCommitExists(workspace.rootDir, workspace.meta.baseline.revision)) {
      issues.push({
        severity: "error",
        code: "meta.baseline.revision.missing",
        path: "llmdoc/meta.json",
        message: `baseline.revision 不存在于当前 git 历史: ${workspace.meta.baseline.revision}`
      });
    }
    const metaPaths = Object.keys(workspace.meta.documents).sort();
    const docPaths = [...seenDocPaths].sort();

    for (const docPath of docPaths) {
      if (!(docPath in workspace.meta.documents)) {
        issues.push({
          severity: "error",
          code: "meta.entry.missing",
          path: `llmdoc/${docPath}`,
          message: "meta.json 缺少对应 documents entry。"
        });
      }
    }

    for (const metaPath of metaPaths) {
      if (!seenDocPaths.has(metaPath)) {
        issues.push({
          severity: "error",
          code: "meta.entry.orphaned",
          path: `llmdoc/${metaPath}`,
          message: "meta.json 中存在孤儿 documents entry。"
        });
      }
      const revision = workspace.meta.documents[metaPath]?.validatedRevision;
      if (revision && !gitCommitExists(workspace.rootDir, revision)) {
        issues.push({
          severity: "error",
          code: "meta.document.revision.missing",
          path: `llmdoc/${metaPath}`,
          message: `validatedRevision 不存在于当前 git 历史: ${revision}`
        });
      }
    }
  }

  return issues;
}

function isGlob(input: string): boolean {
  return /[*?[\]{}]/.test(input);
}

function validateMdxBody(body: string): string[] {
  const cleanBody = stripMarkdownLiterals(body);
  const issues: string[] = [];
  if (/^\s*import\s+/m.test(cleanBody) || /^\s*export\s+/m.test(cleanBody)) {
    issues.push("仅允许纯 Markdown 与自闭合 CodeRef，禁止 import/export。");
  }
  if (/<(?!CodeRef\b)[A-Za-z][^>]*>/m.test(cleanBody) || /<\/[A-Za-z][^>]*>/m.test(cleanBody)) {
    issues.push("仅允许自闭合 <CodeRef ... /> 组件，禁止任意 JSX 标签。");
  }
  if (/\{[^}\n]+\}/m.test(cleanBody)) {
    issues.push("禁止在正文中使用 MDX/JS 表达式。");
  }
  issues.push(...validateCodeRefTags(body));
  return [...new Set(issues)];
}

function validateLlmdocRelativePath(input: string): { ok: true; value: string } | { ok: false; message: string } {
  try {
    const normalized = normalizeRepoRelativePath(input);
    if (!normalized.endsWith(".mdx")) {
      return { ok: false, message: `路径必须指向 .mdx 文档: ${input}` };
    }
    if (normalized.startsWith("llmdoc/")) {
      return { ok: false, message: `路径必须是 llmdoc/ 下相对路径而非仓库根路径: ${input}` };
    }
    return { ok: true, value: normalized };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

function validateRepoPath(
  rootDir: string,
  input: string
): { ok: true; absolutePath: string; normalized: string } | { ok: false; message: string } {
  try {
    const normalized = normalizeRepoRelativePath(input);
    const absolutePath = resolveInsideRoot(rootDir, normalized);
    return { ok: true, absolutePath, normalized };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

function validateCodePathPattern(
  rootDir: string,
  input: string
): { ok: true; absolutePath: string; normalized: string; isGlob: boolean } | { ok: false; message: string } {
  try {
    const normalized = normalizeRepoRelativePath(input);
    const glob = isGlob(normalized);
    if (!glob) {
      const absolutePath = resolveInsideRoot(rootDir, normalized);
      return { ok: true, absolutePath, normalized, isGlob: false };
    }

    const staticPrefixSegments: string[] = [];
    for (const segment of normalized.split("/")) {
      if (isGlob(segment)) {
        break;
      }
      staticPrefixSegments.push(segment);
    }
    const staticPrefix = staticPrefixSegments.join("/");
    const prefix = staticPrefix || ".";
    const absolutePath = prefix === "." ? rootDir : resolveInsideRoot(rootDir, prefix);
    return { ok: true, absolutePath, normalized, isGlob: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
