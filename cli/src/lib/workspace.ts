import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ParsedDocument, ValidationIssue, WorkspaceData, MetaLedger, DocumentFrontmatter } from "../types.js";
import { DOC_LINE_WARNING_LIMIT } from "./constants.js";
import { CliError } from "./errors.js";
import { estimateTokens, extractCodeRefs, extractLinks, extractTitle, resolveDocLink, stripMarkdownLiterals, validateCodeRefTags } from "./markdown.js";
import { assertDocKindMatchesShape, parseDocTargetShape } from "./doc-shape.js";
import { normalizeRepoRelativePath, repoPath, resolveInsideRoot } from "./fs.js";
import { gitCommitExists, isShallowRepository } from "./git.js";
import { matchesCodePathPattern } from "./search.js";
import { validateDocFrontmatter, validateMeta } from "./schema.js";
import { LLMDOC_CONFIG_FILENAME, LLMDOC_LOCAL_CONFIG_FILENAME, loadLlmdocConfig } from "./config.js";
import { parseYamlFrontmatter } from "./frontmatter.js";
import { isSourceRef, parseSourceDocId } from "./source-id.js";
import { loadSourcesReadOnly } from "./sources.js";

export function loadWorkspace(rootDir: string): WorkspaceData {
  const configuredLlmdocDir = path.join(rootDir, "llmdoc");
  if (!fs.existsSync(configuredLlmdocDir) || !fs.statSync(configuredLlmdocDir).isDirectory()) {
    throw new CliError("The repository does not contain an llmdoc/ directory.", 2);
  }
  resolveInsideRoot(rootDir, "llmdoc");
  const llmdocDir = configuredLlmdocDir;

  const preloadIssues: ValidationIssue[] = [];
  const unparsedDocPaths = new Set<string>();
  const documents = scanDocuments(rootDir, llmdocDir, preloadIssues, unparsedDocPaths);
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
  const llmdocConfig = loadLlmdocConfig(rootDir, documentsByLlmdocPath);
  const loadedSources = loadSourcesReadOnly(rootDir, llmdocConfig.sources);

  return {
    rootDir,
    llmdocDir,
    metaPath,
    documents,
    documentsByLlmdocPath,
    topics,
    rootSingletons,
    meta,
    llmdocConfig,
    preloadIssues,
    sources: loadedSources.sources,
    sourcesByName: loadedSources.sourcesByName,
    sourceDocuments: loadedSources.sourceDocuments,
    sourceDocumentsById: loadedSources.sourceDocumentsById,
    unparsedDocPaths
  };
}

function scanDocuments(
  rootDir: string,
  llmdocDir: string,
  preloadIssues: ValidationIssue[],
  unparsedDocPaths: Set<string>
): ParsedDocument[] {
  const results: ParsedDocument[] = [];

  walk(llmdocDir, (absolutePath) => {
    const repoRelativePath = repoPath(rootDir, absolutePath);
    if (!absolutePath.endsWith(".mdx")) {
      if (absolutePath !== path.join(llmdocDir, "meta.json")) {
        preloadIssues.push({
          severity: "error",
          code: "file.extension.invalid",
          path: repoRelativePath,
          message: "llmdoc/ allows only .mdx documents and one root-level meta.json file."
        });
      }
      return;
    }

    const llmdocPath = repoPath(llmdocDir, absolutePath);
    const raw = fs.readFileSync(absolutePath, "utf8");
    let parsed;
    try {
      parsed = parseYamlFrontmatter(raw);
    } catch (error) {
      unparsedDocPaths.add(llmdocPath);
      preloadIssues.push({
        severity: "error",
        code: "frontmatter.parse",
        path: repoRelativePath,
        message: `Front matter parse failed: ${(error as Error).message}`
      });
      return;
    }
    const frontmatter = parsed.data as unknown as DocumentFrontmatter;
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
      lineCount: raw.split(/\r?\n/).length,
      sourceName: null,
      sourceRelativePath: null,
      sourceMountPath: null
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
      message: `meta.json parse failed: ${(error as Error).message}`
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
        message: `Invalid meta.json: ${error}`
      });
    }
    return null;
  }
  return raw;
}

export function validateWorkspace(workspace: WorkspaceData): ValidationIssue[] {
  const issues: ValidationIssue[] = [...workspace.preloadIssues];
  issues.push(...workspace.llmdocConfig.issues);
  const seenDocPaths = new Set<string>();
  const declaredSourceAliases = new Set(Object.keys(workspace.llmdocConfig.config?.sources ?? {}));

  if (!workspace.meta) {
    issues.push({
      severity: "error",
      code: "meta.missing",
      path: "llmdoc/meta.json",
      message:
        "llmdoc/meta.json is missing. Run `npx -y @tokenroll/llmdoc init-state` to create the ledger (create the initial Git commit first if the repository has no commits)."
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
        message: `Invalid front matter: ${error}`
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
        message: "A topic cannot contain nested subdirectories."
      });
    }

    if (workspace.llmdocConfig.schemaVersion === 2 && document.topic?.startsWith("@")) {
      issues.push({
        severity: "error",
        code: "hierarchy.reserved-prefix",
        path: document.repoPath,
        message: `Topic "${document.topic}" starts with "@", which is reserved for external sources in llmdoc.config/v2. Rename it with \`llmdoc mv llmdoc/${document.topic} llmdoc/${document.topic.slice(1)}\`.`
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

    if (/\[\[[^\]\n]+\]\]/.test(stripMarkdownLiterals(document.body))) {
      issues.push({
        severity: "warning",
        code: "link.wikilink",
        path: document.repoPath,
        message: "The body contains [[wikilink]] syntax, which llmdoc does not parse. Use a standard relative Markdown link."
      });
    }

    for (const relationPath of document.frontmatter.relations?.requires ?? []) {
      if (isSourceRef(relationPath)) {
        let parsedRef;
        try {
          parsedRef = parseSourceDocId(relationPath);
        } catch (error) {
          issues.push({
            severity: "error",
            code: "relations.requires.invalid-path",
            path: document.repoPath,
            message: (error as Error).message
          });
          continue;
        }
        if (!declaredSourceAliases.has(parsedRef.alias)) {
          issues.push({
            severity: "error",
            code: "relations.requires.undeclared-source",
            path: document.repoPath,
            message: `requires references an undeclared source: @${parsedRef.alias} (${relationPath})`
          });
          continue;
        }
        const loadedSource = workspace.sourcesByName.get(parsedRef.alias);
        if (!loadedSource || loadedSource.status !== "ready") {
          issues.push({
            severity: "warning",
            code: "relations.requires.source-unavailable",
            path: document.repoPath,
            message: `requires target ${parsedRef.canonicalId} could not be verified because source @${parsedRef.alias} is unavailable${loadedSource?.remedy ? ` (${loadedSource.remedy})` : ""}.`
          });
        } else if (!workspace.sourceDocumentsById.has(parsedRef.canonicalId)) {
          issues.push({
            severity: "warning",
            code: "relations.requires.source-missing",
            path: document.repoPath,
            message: `requires points to a missing document in @${parsedRef.alias}${loadedSource.revision ? ` (${loadedSource.revision.slice(0, 7)})` : ""}: ${parsedRef.canonicalId}`
          });
        }
        continue;
      }

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
          message: `requires points to a missing document: ${relationPath}`
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
          message: `related points to a missing document: ${relationPath}`
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
          message: `Invalid body link: ${linkTarget} (${normalizedLink.message})`
        });
      } else if (!workspace.documentsByLlmdocPath.has(normalizedLink.value)) {
        issues.push({
          severity: "error",
          code: "link.missing",
          path: document.repoPath,
          message: `Body link points to a missing document: ${linkTarget}`
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
          message: `CodeRef path does not exist: ${codeRef.path}`
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
          message: `code.paths points to a missing path: ${codePath}`
        });
      } else if (
        normalized.isGlob &&
        !globMatchesExistingFile(workspace.rootDir, normalized.absolutePath, normalized.normalized)
      ) {
        issues.push({
          severity: "error",
          code: "code.paths.unmatched",
          path: document.repoPath,
          message: `code.paths glob matches no existing files: ${codePath}`
        });
      }
    }

    if (document.lineCount > DOC_LINE_WARNING_LIMIT) {
      issues.push({
        severity: "warning",
        code: "size.line-warning",
        path: document.repoPath,
        message: `The document has ${document.lineCount} lines, exceeding the recommended limit of ${DOC_LINE_WARNING_LIMIT}.`
      });
    }
  }

  for (const source of workspace.sources) {
    if (source.status !== "ready") {
      issues.push({
        severity: "warning",
        code: source.status === "missing" ? "source.unavailable" : "source.error",
        path: LLMDOC_CONFIG_FILENAME,
        message: `Source @${source.name} is unavailable: ${source.error ?? "no local snapshot"}.${source.remedy ? ` ${source.remedy}` : ""}`
      });
    }
    for (const sourceIssue of source.issues) {
      issues.push({
        ...sourceIssue,
        severity: "warning"
      });
    }
  }

  for (const preloadEntry of workspace.llmdocConfig.preloadEntries) {
    if (preloadEntry.kind !== "source" || !preloadEntry.sourceName) {
      continue;
    }
    const source = workspace.sourcesByName.get(preloadEntry.sourceName);
    if (!source || source.status !== "ready") {
      issues.push({
        severity: "warning",
        code: "config.startup.preload.source-unavailable",
        path: LLMDOC_CONFIG_FILENAME,
        message: `startup.preload source document could not be verified because @${preloadEntry.sourceName} is unavailable: ${preloadEntry.normalized}`
      });
    } else if (!workspace.sourceDocumentsById.has(preloadEntry.normalized)) {
      issues.push({
        severity: "warning",
        code: "config.startup.preload.source-missing",
        path: LLMDOC_CONFIG_FILENAME,
        message: `startup.preload source document does not exist in @${preloadEntry.sourceName}${source.revision ? ` (${source.revision.slice(0, 7)})` : ""}: ${preloadEntry.normalized}`
      });
    }
  }

  if (workspace.llmdocConfig.localConfigExists && isGitTrackedFile(workspace.rootDir, LLMDOC_LOCAL_CONFIG_FILENAME)) {
    issues.push({
      severity: "warning",
      code: "config.local.tracked",
      path: LLMDOC_LOCAL_CONFIG_FILENAME,
      message: `${LLMDOC_LOCAL_CONFIG_FILENAME} is tracked by Git. Add it to .gitignore so machine-specific paths are not committed.`
    });
  }

  for (const [topic, docs] of workspace.topics) {
    if (docs.length === 0) {
      issues.push({
        severity: "warning",
        code: "topic.empty",
        path: `llmdoc/${topic}`,
        message: "The topic directory is empty."
      });
    }
  }

  if (workspace.meta) {
    // shallow clone 中历史 commit 天然不可达:revision 缺失降级为 warning,
    // 否则任何 fetch-depth:1 的 CI 都会误报陈旧。
    const shallow = isShallowRepository(workspace.rootDir);
    const revisionSeverity = shallow ? ("warning" as const) : ("error" as const);
    const shallowHint = shallow ? " (shallow clone; use fetch-depth: 0 or git fetch --unshallow for complete validation)" : "";
    if (!gitCommitExists(workspace.rootDir, workspace.meta.baseline.revision)) {
      issues.push({
        severity: revisionSeverity,
        code: "meta.baseline.revision.missing",
        path: "llmdoc/meta.json",
        message: `baseline.revision does not exist in current Git history: ${workspace.meta.baseline.revision}${shallowHint}`
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
          message: "meta.json is missing the corresponding documents entry. Use `llmdoc adopt <path>` to register it without rewriting the document."
        });
      }
    }

    for (const metaPath of metaPaths) {
      if (!seenDocPaths.has(metaPath) && !workspace.unparsedDocPaths?.has(metaPath)) {
        issues.push({
          severity: "error",
          code: "meta.entry.orphaned",
          path: `llmdoc/${metaPath}`,
          message: "meta.json contains an orphan documents entry."
        });
      }
      const revision = workspace.meta.documents[metaPath]?.validatedRevision;
      if (revision && !gitCommitExists(workspace.rootDir, revision)) {
        issues.push({
          severity: revisionSeverity,
          code: "meta.document.revision.missing",
          path: `llmdoc/${metaPath}`,
          message: `validatedRevision does not exist in current Git history: ${revision}${shallowHint}`
        });
      }
    }
  }

  return issues;
}

function isGitTrackedFile(rootDir: string, repoRelativePath: string): boolean {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", repoRelativePath], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0;
}

function isGlob(input: string): boolean {
  return /[*?[\]{}]/.test(input);
}

function validateMdxBody(body: string): string[] {
  const cleanBody = stripMarkdownLiterals(body);
  const issues: string[] = [];
  if (/^\s*import\s+/m.test(cleanBody) || /^\s*export\s+/m.test(cleanBody)) {
    issues.push("Only plain Markdown and self-closing CodeRef tags are allowed; import/export is forbidden.");
  }
  if (/<(?!CodeRef\b)[A-Za-z][^>]*>/m.test(cleanBody) || /<\/[A-Za-z][^>]*>/m.test(cleanBody)) {
    issues.push("Only self-closing <CodeRef ... /> components are allowed; arbitrary JSX tags are forbidden.");
  }
  if (/\{[^}\n]+\}/m.test(cleanBody)) {
    issues.push("MDX/JS expressions are forbidden in document bodies.");
  }
  issues.push(...validateCodeRefTags(body));
  return [...new Set(issues)];
}

function validateLlmdocRelativePath(input: string): { ok: true; value: string } | { ok: false; message: string } {
  try {
    const normalized = normalizeRepoRelativePath(input);
    if (!normalized.endsWith(".mdx")) {
      return { ok: false, message: `Path must point to an .mdx document: ${input}` };
    }
    if (normalized.startsWith("llmdoc/")) {
      return { ok: false, message: `Path must be relative to llmdoc/, not the repository root: ${input}` };
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

function globMatchesExistingFile(rootDir: string, staticPrefixPath: string, pattern: string): boolean {
  const pending = [staticPrefixPath];

  while (pending.length > 0) {
    const currentPath = pending.pop()!;
    const stat = fs.lstatSync(currentPath);
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isFile()) {
      if (matchesCodePathPattern(pattern, repoPath(rootDir, currentPath))) {
        return true;
      }
      continue;
    }
    if (!stat.isDirectory()) {
      continue;
    }

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory() && [".git", ".llmdoc-tmp", "node_modules"].includes(entry.name)) {
        continue;
      }
      pending.push(path.join(currentPath, entry.name));
    }
  }

  return false;
}
