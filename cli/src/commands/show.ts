import { paginate, paginationMetadata } from "../lib/pagination.js";
import { loadWorkspace } from "../lib/workspace.js";
import { CliError } from "../lib/errors.js";
import { OutputOptions, ParsedDocument } from "../types.js";
import { DEFAULT_SHOW_BUDGET } from "../lib/constants.js";
import { formatPaginationSummary } from "../lib/format.js";
import { estimateTokens } from "../lib/markdown.js";
import { formatDocumentPath, isSourceRef, parseSourceDocId } from "../lib/source-id.js";
import { ensureSourcesForRead } from "../lib/sources.js";

interface ShowOptions extends OutputOptions {
  cwd: string;
  paths: string[];
}

export function runShow(options: ShowOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const requestedSourceAliases = new Set<string>();
  const parsedRequests = options.paths.map((rawPath) => {
    if (isSourceRef(rawPath)) {
      const parsed = parseSourceDocId(rawPath);
      if (!workspace.sourcesByName.has(parsed.alias)) {
        throw new CliError(`Unknown source: @${parsed.alias}`);
      }
      requestedSourceAliases.add(parsed.alias);
      return { kind: "source" as const, rawPath, parsed };
    }
    return { kind: "local" as const, rawPath };
  });

  if (requestedSourceAliases.size > 0) {
    ensureSourcesForRead(workspace, [...requestedSourceAliases]);
  }

  const documents = parsedRequests.map((request) => {
    if (request.kind === "source") {
      const source = workspace.sourcesByName.get(request.parsed.alias);
      if (!source || source.status !== "ready") {
        throw new CliError(
          `Source @${request.parsed.alias} is unavailable: ${source?.error ?? "no local snapshot"}.${source?.remedy ? ` ${source.remedy}` : ""}`
        );
      }
      const document = workspace.sourceDocumentsById.get(request.parsed.canonicalId);
      if (!document) {
        throw new CliError(`Document does not exist in @${request.parsed.alias}: ${request.parsed.canonicalId}`);
      }
      return document;
    }

    const normalized = request.rawPath.startsWith("llmdoc/") ? request.rawPath.slice("llmdoc/".length) : request.rawPath;
    const document = workspace.documentsByLlmdocPath.get(normalized);
    if (!document) {
      throw new CliError(`Document does not exist: ${request.rawPath}`);
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
    lines.push(`=== ${formatDocumentPath(document)} [${document.frontmatter.kind}] ===`);
    lines.push(document.body);
    lines.push("");
  }
  lines.push(...formatPaginationSummary(result));
  return lines.join("\n");
}

function toDocumentPayload(document: ParsedDocument): object {
  return {
    path: formatDocumentPath(document),
    kind: document.frontmatter.kind,
    description: document.frontmatter.description,
    body: document.body,
    ...(document.sourceName ? { source: document.sourceName } : {})
  };
}
