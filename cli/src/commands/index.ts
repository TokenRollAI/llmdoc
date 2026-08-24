import { paginate } from "../lib/pagination.js";
import { assertDocumentKind } from "../lib/doc-shape.js";
import { loadWorkspace } from "../lib/workspace.js";
import { OutputOptions } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { paginationMetadata } from "../lib/pagination.js";
import { estimateTokens } from "../lib/markdown.js";
import { ParsedDocument } from "../types.js";

interface IndexOptions extends OutputOptions {
  cwd: string;
  topic?: string;
  kind?: string;
}

export function runIndex(options: IndexOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const kind = options.kind ? assertDocumentKind(options.kind) : undefined;
  const filtered = workspace.documents.filter((document) => {
    if (options.topic && document.topic !== options.topic) {
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
      pagination: paginationMetadata(result)
    };
  }

  const lines: string[] = [];
  for (const document of result.items) {
    lines.push(`llmdoc/${document.llmdocPath}  [${document.frontmatter.kind}]`);
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
    path: `llmdoc/${document.llmdocPath}`,
    kind: document.frontmatter.kind,
    description: document.frontmatter.description,
    relations: document.frontmatter.relations ?? {},
    code: document.frontmatter.code ?? {}
  };
}
