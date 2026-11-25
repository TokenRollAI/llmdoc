import { paginate, paginationMetadata } from "../lib/pagination.js";
import { assertDocumentKind } from "../lib/doc-shape.js";
import { CliError } from "../lib/errors.js";
import { loadWorkspace } from "../lib/workspace.js";
import { OutputOptions } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { SearchResult, searchDocuments } from "../lib/search.js";
import { estimateTokens } from "../lib/markdown.js";
import { formatDocumentPath, isSourceRef, parseSourceTopicFilter } from "../lib/source-id.js";
import { ensureSourcesForRead } from "../lib/sources.js";

interface SearchOptions extends OutputOptions {
  cwd: string;
  query: string;
  topic?: string;
  kind?: string;
}

export function runSearch(options: SearchOptions): unknown {
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

  const search = searchDocuments(workspace, options.query, {
    topic: options.topic,
    kind
  });
  const paginated = paginate({
    items: search.results,
    estimate: (entry) => estimateTokens(JSON.stringify(toPayload(entry))),
    options
  });

  if (options.json) {
    return {
      query: options.query,
      searchMode: search.mode,
      results: paginated.items.map(toPayload),
      ...(warnings.length > 0 ? { warnings } : {}),
      pagination: paginationMetadata(paginated)
    };
  }

  const lines: string[] = [];
  for (const warning of warnings) {
    lines.push(`warning: ${warning}`);
  }
  if (warnings.length > 0) {
    lines.push("");
  }
  if (search.mode === "cjk-bigram-fallback") {
    lines.push("note: Chinese segmentation returned no matches; CJK bigram fallback was used.", "");
  }
  for (const entry of paginated.items) {
    lines.push(`${formatDocumentPath(entry.document)}  [${entry.document.frontmatter.kind}]`);
    lines.push(`  ${entry.document.frontmatter.description}`);
    lines.push(`  ${entry.snippet}`);
    lines.push("");
  }
  lines.push(...formatPaginationSummary(paginated));
  return lines.join("\n");
}

function toPayload(entry: SearchResult): object {
  return {
    path: formatDocumentPath(entry.document),
    kind: entry.document.frontmatter.kind,
    description: entry.document.frontmatter.description,
    snippet: entry.snippet,
    score: entry.score,
    ...(entry.document.sourceName ? { source: entry.document.sourceName } : {})
  };
}
