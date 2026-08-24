import { paginate, paginationMetadata } from "../lib/pagination.js";
import { loadWorkspace } from "../lib/workspace.js";
import { CliError } from "../lib/errors.js";
import { OutputOptions, ParsedDocument } from "../types.js";
import { DEFAULT_SHOW_BUDGET } from "../lib/constants.js";
import { formatPaginationSummary } from "../lib/format.js";
import { estimateTokens } from "../lib/markdown.js";

interface ShowOptions extends OutputOptions {
  cwd: string;
  paths: string[];
}

export function runShow(options: ShowOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const documents = options.paths.map((rawPath) => {
    const normalized = rawPath.startsWith("llmdoc/") ? rawPath.slice("llmdoc/".length) : rawPath;
    const document = workspace.documentsByLlmdocPath.get(normalized);
    if (!document) {
      throw new CliError(`文档不存在: ${rawPath}`);
    }
    return document;
  });

  const result = paginate({
    items: documents,
    estimate: (document) => estimateTokens(JSON.stringify(toDocumentPayload(document))),
    options: {
      ...options,
      budget: options.budget ?? DEFAULT_SHOW_BUDGET
    }
  });

  if (options.json) {
    return {
      documents: result.items.map(toDocumentPayload),
      pagination: paginationMetadata(result)
    };
  }

  const lines: string[] = [];
  for (const document of result.items) {
    lines.push(`=== llmdoc/${document.llmdocPath} [${document.frontmatter.kind}] ===`);
    lines.push(document.body);
    lines.push("");
  }
  lines.push(...formatPaginationSummary(result));
  return lines.join("\n");
}

function toDocumentPayload(document: ParsedDocument): object {
  return {
    path: `llmdoc/${document.llmdocPath}`,
    kind: document.frontmatter.kind,
    description: document.frontmatter.description,
    body: document.body
  };
}
