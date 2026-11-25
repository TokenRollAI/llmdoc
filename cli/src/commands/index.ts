import { paginate, paginationMetadata } from "../lib/pagination.js";
import { assertDocumentKind } from "../lib/doc-shape.js";
import { CliError } from "../lib/errors.js";
import { loadWorkspace } from "../lib/workspace.js";
import { OutputOptions, ParsedDocument } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { estimateTokens } from "../lib/markdown.js";
import { formatDocumentPath, isSourceRef, matchesDocumentTopic, parseSourceTopicFilter } from "../lib/source-id.js";
import { ensureSourcesForRead } from "../lib/sources.js";

interface IndexOptions extends OutputOptions {
  cwd: string;
  topic?: string;
  kind?: string;
}

export function runIndex(options: IndexOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const kind = options.kind ? assertDocumentKind(options.kind) : undefined;
  const warnings: string[] = [];
  const warnedAliases = new Set<string>();

  if (options.topic && isSourceRef(options.topic)) {
    const parsedTopic = parseSourceTopicFilter(options.topic);
    if (!workspace.sourcesByName.has(parsedTopic.alias)) {
      throw new CliError(`Unknown source: @${parsedTopic.alias}`);
    }
    const cold = ensureSourcesForRead(workspace, [parsedTopic.alias]);
    warnings.push(...cold.warnings);
    if (cold.warnings.length > 0) {
      warnedAliases.add(parsedTopic.alias);
    }
    const source = workspace.sourcesByName.get(parsedTopic.alias);
    if (source && source.status !== "ready" && !warnedAliases.has(source.name)) {
      warnedAliases.add(source.name);
      warnings.push(
        `Source @${source.name} is unavailable: ${source.error ?? "no local snapshot"}.${source.remedy ? ` ${source.remedy}` : ""}`
      );
    }
  } else if (!options.topic && workspace.sources.length > 0) {
    const cold = ensureSourcesForRead(workspace);
    warnings.push(...cold.warnings);
    for (const fetchedAlias of cold.fetched) {
      const source = workspace.sourcesByName.get(fetchedAlias);
      if (source && source.status !== "ready") {
        warnedAliases.add(fetchedAlias);
      }
    }
    for (const source of workspace.sources) {
      if (source.status !== "ready" && !warnedAliases.has(source.name)) {
        warnedAliases.add(source.name);
        warnings.push(
          `Source @${source.name} is unavailable: ${source.error ?? "no local snapshot"}.${source.remedy ? ` ${source.remedy}` : ""}`
        );
      }
    }
  }

  const allDocuments = [...workspace.documents, ...workspace.sourceDocuments];
  const filtered = allDocuments.filter((document) => {
    if (options.topic && !matchesDocumentTopic(document, options.topic)) {
      return false;
    }
    if (kind && document.frontmatter.kind !== kind) {
      return false;
    }
    return true;
  });

  const result = paginate({
    items: filtered,
    estimate: (document) => estimateTokens(JSON.stringify(toPayload(document))),
    options
  });

  if (options.json) {
    return {
      documents: result.items.map(toPayload),
      ...(warnings.length > 0 ? { warnings } : {}),
      pagination: paginationMetadata(result)
    };
  }

  const lines: string[] = [];
  for (const warning of warnings) {
    lines.push(`warning: ${warning}`);
  }
  if (warnings.length > 0 && result.items.length > 0) {
    lines.push("");
  }
  for (const document of result.items) {
    lines.push(`${formatDocumentPath(document)}  [${document.frontmatter.kind}]`);
    lines.push(`  ${document.frontmatter.description}`);
    if (document.frontmatter.relations?.requires?.length) {
      lines.push(`  requires: ${document.frontmatter.relations.requires.join(", ")}`);
    }
    if (document.frontmatter.code?.paths?.length) {
      lines.push(`  code.paths: ${document.frontmatter.code.paths.join(", ")}`);
    }
    lines.push("");
  }
  lines.push(...formatPaginationSummary(result));
  return lines.join("\n");
}

function toPayload(document: ParsedDocument): object {
  return {
    path: formatDocumentPath(document),
    kind: document.frontmatter.kind,
    description: document.frontmatter.description,
    relations: document.frontmatter.relations ?? {},
    code: document.frontmatter.code ?? {},
    ...(document.sourceName ? { source: document.sourceName } : {})
  };
}
