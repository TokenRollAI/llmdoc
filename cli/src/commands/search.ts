import { paginate, paginationMetadata } from "../lib/pagination.js";
import { assertDocumentKind } from "../lib/doc-shape.js";
import { loadWorkspace } from "../lib/workspace.js";
import { OutputOptions } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { searchDocuments } from "../lib/search.js";
import { estimateTokens } from "../lib/markdown.js";

interface SearchOptions extends OutputOptions {
  cwd: string;
  query: string;
  topic?: string;
  kind?: string;
}

export function runSearch(options: SearchOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const kind = options.kind ? assertDocumentKind(options.kind) : undefined;
  const results = searchDocuments(workspace, options.query, {
    topic: options.topic,
    kind
  });
  const paginated = paginate({
    items: results,
    estimate: (entry) => estimateTokens(JSON.stringify(toPayload(entry))),
    options
  });

  if (options.json) {
    return {
      query: options.query,
      results: paginated.items.map(toPayload),
      pagination: paginationMetadata(paginated)
    };
  }

  const lines: string[] = [];
  for (const entry of paginated.items) {
    lines.push(`llmdoc/${entry.document.llmdocPath}  [${entry.document.frontmatter.kind}]`);
    lines.push(`  ${entry.document.frontmatter.description}`);
    lines.push(`  ${entry.snippet}`);
    lines.push("");
  }
  lines.push(...formatPaginationSummary(paginated));
  return lines.join("\n");
}

function toPayload(entry: ReturnType<typeof searchDocuments>[number]): object {
  return {
    path: `llmdoc/${entry.document.llmdocPath}`,
    kind: entry.document.frontmatter.kind,
    description: entry.document.frontmatter.description,
    snippet: entry.snippet,
    score: entry.score
  };
}
