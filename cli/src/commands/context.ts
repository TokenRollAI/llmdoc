import { loadWorkspace } from "../lib/workspace.js";
import { matchesCodePathPattern } from "../lib/search.js";
import { CliError } from "../lib/errors.js";
import { OutputOptions, ParsedDocument, WorkspaceData } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { paginate, paginationMetadata } from "../lib/pagination.js";
import { normalizeRepoRelativePath, resolveInsideRoot } from "../lib/fs.js";
import { estimateTokens } from "../lib/markdown.js";
import { formatDocumentPath, isSourceRef, parseSourceDocId } from "../lib/source-id.js";
import { ensureSourcesForRead, sourceDocumentMatchesPath } from "../lib/sources.js";

interface ContextOptions extends OutputOptions {
  cwd: string;
  files: string[];
}

interface MissingPrerequisite {
  path: string;
  reason: string;
}

export function runContext(options: ContextOptions): unknown {
  if (options.files.length === 0) {
    throw new CliError("context requires at least one --files input.");
  }

  const workspace = loadWorkspace(options.cwd);
  const normalizedFiles = options.files.map((file) => {
    const normalized = normalizeRepoRelativePath(file);
    // 允许尚不存在的路径:"我要新建/删除这个文件,该先读哪些文档"是合法问法;
    // resolveInsideRoot 仍负责拦截越界与 symlink 逃逸。
    const absolutePath = resolveInsideRoot(workspace.rootDir, normalized, { allowMissing: true });
    return {
      normalized,
      absolutePath
    };
  });

  const localDocumentsByFile = normalizedFiles.map((file) => ({
    file,
    documents: workspace.documents.filter((document) =>
      (document.frontmatter.code?.paths ?? []).some((pattern) => matchesCodePathPattern(pattern, file.normalized))
    )
  }));
  const localImpactedPaths = new Set(
    localDocumentsByFile.flatMap(({ documents }) => documents.map((document) => document.llmdocPath))
  );
  const localImpacted = workspace.documents.filter((document) => localImpactedPaths.has(document.llmdocPath));

  // Unmapped files are strictly determined by local owners so external references never hide missing local ownership.
  const unmappedFiles = localDocumentsByFile
    .filter(({ documents }) => documents.length === 0)
    .map(({ file }) => file.normalized);

  const warnings: string[] = [];
  const warnedAliases = new Set<string>();
  const relevantGitAliases = collectRelevantGitAliases(workspace, localImpacted);
  if (relevantGitAliases.length > 0) {
    const cold = ensureSourcesForRead(workspace, relevantGitAliases);
    warnings.push(...cold.warnings);
    for (const alias of relevantGitAliases) {
      const source = workspace.sourcesByName.get(alias);
      if (source && source.status !== "ready") {
        warnedAliases.add(alias);
      }
    }
  }
  for (const source of workspace.sources) {
    if (source.kind === "git" && source.status !== "ready" && !warnedAliases.has(source.name)) {
      warnedAliases.add(source.name);
      warnings.push(
        `Source @${source.name} was not searched because it is unavailable: ${source.error ?? "no local snapshot"}.${source.remedy ? ` ${source.remedy}` : ""}`
      );
    }
  }

  const sourceImpactedIds = new Set(
    normalizedFiles.flatMap((file) =>
      workspace.sourceDocuments
        .filter((document) => sourceDocumentMatchesPath(document, file.normalized))
        .map((document) => document.llmdocPath)
    )
  );
  const sourceImpacted = workspace.sourceDocuments.filter((document) => sourceImpactedIds.has(document.llmdocPath));
  const impacted = [...localImpacted, ...sourceImpacted].sort((left, right) =>
    formatDocumentPath(left).localeCompare(formatDocumentPath(right))
  );

  const { prerequisites, missingPrerequisites } = collectRequires(workspace, impacted);
  const rows = [
    ...impacted.map((document) => ({ role: "impacted" as const, document })),
    ...prerequisites.map((document) => ({ role: "requires" as const, document }))
  ];
  const result = paginate({
    items: rows,
    estimate: (row) => estimateTokens(JSON.stringify({ role: row.role, ...toPayload(row.document) })),
    options
  });

  if (options.json) {
    return {
      impacted: result.items.filter((row) => row.role === "impacted").map((row) => toPayload(row.document)),
      prerequisites: result.items.filter((row) => row.role === "requires").map((row) => toPayload(row.document)),
      ...(missingPrerequisites.length > 0 ? { missingPrerequisites } : {}),
      unmappedFiles,
      ...(warnings.length > 0 ? { warnings } : {}),
      pagination: paginationMetadata(result)
    };
  }

  const impactedWord = impacted.length === 1 ? "document" : "documents";
  const prereqWord = prerequisites.length === 1 ? "prerequisite" : "prerequisites";
  const lines: string[] = [`${impacted.length} ${impactedWord} impacted, ${prerequisites.length} recommended ${prereqWord}:`];
  if (result.items.length > 0) {
    lines.push("");
    for (const row of result.items) {
      const prefix = row.role === "requires" ? "  requires -> " : "  ";
      const document = row.document;
      lines.push(`${prefix}${formatDocumentPath(document)}  [${document.frontmatter.kind}]`);
      lines.push(`    ${document.frontmatter.description}`);
    }
  }
  if (missingPrerequisites.length > 0) {
    lines.push("", `missing external prerequisites: ${missingPrerequisites.length}`);
    for (const missing of missingPrerequisites) {
      lines.push(`  missing -> ${missing.path} (${missing.reason})`);
    }
  }
  if (warnings.length > 0) {
    lines.push("");
    for (const warning of warnings) {
      lines.push(`warning: ${warning}`);
    }
  }
  const hasExternalHitsWithUnmapped = sourceImpacted.length > 0 && unmappedFiles.length > 0;
  lines.push(
    "",
    hasExternalHitsWithUnmapped
      ? `unmapped files: ${unmappedFiles.length} (no local llmdoc owner)`
      : `unmapped files: ${unmappedFiles.length}`
  );
  for (const file of unmappedFiles) {
    lines.push(`  unmapped -> ${file}`);
  }
  lines.push("", ...formatPaginationSummary(result));
  return lines.join("\n");
}

function collectRelevantGitAliases(workspace: WorkspaceData, localImpacted: readonly ParsedDocument[]): string[] {
  const aliases = new Set<string>();
  for (const source of workspace.sources) {
    if (source.kind === "git" && source.status === "missing") {
      aliases.add(source.name);
    }
  }
  for (const document of localImpacted) {
    for (const req of document.frontmatter.relations?.requires ?? []) {
      if (!isSourceRef(req)) {
        continue;
      }
      try {
        const parsed = parseSourceDocId(req);
        if (workspace.sourcesByName.get(parsed.alias)?.kind === "git") {
          aliases.add(parsed.alias);
        }
      } catch {
        continue;
      }
    }
  }
  return [...aliases];
}

function collectRequires(
  workspace: WorkspaceData,
  impacted: readonly ParsedDocument[]
): { prerequisites: ParsedDocument[]; missingPrerequisites: MissingPrerequisite[] } {
  const seen = new Set(impacted.map((document) => formatDocumentPath(document)));
  const queue = [...impacted];
  const results: ParsedDocument[] = [];
  const missingByPath = new Map<string, MissingPrerequisite>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const requirement of current.frontmatter.relations?.requires ?? []) {
      if (isSourceRef(requirement)) {
        let parsed;
        try {
          parsed = parseSourceDocId(requirement);
        } catch (error) {
          if (!missingByPath.has(requirement)) {
            missingByPath.set(requirement, { path: requirement, reason: (error as Error).message });
          }
          continue;
        }
        // Source documents may only traverse prerequisites within the same source.
        if (current.sourceName && current.sourceName !== parsed.alias) {
          continue;
        }
        if (seen.has(parsed.canonicalId)) {
          continue;
        }
        const source = workspace.sourcesByName.get(parsed.alias);
        if (!source) {
          missingByPath.set(parsed.canonicalId, {
            path: parsed.canonicalId,
            reason: `source @${parsed.alias} is not configured`
          });
          continue;
        }
        if (source.status !== "ready") {
          missingByPath.set(parsed.canonicalId, {
            path: parsed.canonicalId,
            reason: `source @${parsed.alias} is unavailable: ${source.error ?? "no local snapshot"}${source.remedy ? ` (${source.remedy})` : ""}`
          });
          continue;
        }
        const next = workspace.sourceDocumentsById.get(parsed.canonicalId);
        if (!next) {
          missingByPath.set(parsed.canonicalId, {
            path: parsed.canonicalId,
            reason: `not found in @${parsed.alias}${source.revision ? ` (${source.revision.slice(0, 7)})` : ""}`
          });
          continue;
        }
        seen.add(parsed.canonicalId);
        results.push(next);
        queue.push(next);
        continue;
      }

      // External source documents cannot require consumer local documents.
      if (current.sourceName) {
        continue;
      }

      const localKey = `llmdoc/${requirement}`;
      if (seen.has(localKey)) {
        continue;
      }
      const next = workspace.documentsByLlmdocPath.get(requirement);
      if (!next) {
        continue;
      }
      seen.add(localKey);
      results.push(next);
      queue.push(next);
    }
  }

  return {
    prerequisites: results.sort((left, right) => formatDocumentPath(left).localeCompare(formatDocumentPath(right))),
    missingPrerequisites: [...missingByPath.values()].sort((left, right) => left.path.localeCompare(right.path))
  };
}

function toPayload(document: ParsedDocument): object {
  return {
    path: formatDocumentPath(document),
    kind: document.frontmatter.kind,
    description: document.frontmatter.description,
    ...(document.sourceName ? { source: document.sourceName } : {})
  };
}
