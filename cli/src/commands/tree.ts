import { paginate, paginationMetadata } from "../lib/pagination.js";
import { loadWorkspace } from "../lib/workspace.js";
import { LoadedSource, OutputOptions, ParsedDocument } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { estimateTokens } from "../lib/markdown.js";
import { formatDocumentPath } from "../lib/source-id.js";
import { toSourceSummary } from "../lib/sources.js";

interface TreeOptions extends OutputOptions {
  docs?: boolean;
  cwd: string;
}

export function runTree(options: TreeOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const sourceSummaries = workspace.sources.map(toSourceSummary);

  if (options.docs) {
    const allDocuments = [...workspace.documents, ...workspace.sourceDocuments];
    const result = paginate({
      items: allDocuments,
      estimate: (document) => estimateTokens(JSON.stringify(toDocumentSummary(document))),
      options
    });

    if (options.json) {
      return {
        root: "llmdoc",
        documents: result.items.map(toDocumentSummary),
        ...(sourceSummaries.length > 0 ? { sources: sourceSummaries } : {}),
        pagination: paginationMetadata(result)
      };
    }

    const lines = [`llmdoc/  (${workspace.documents.length} docs, ~${workspace.documents.reduce((sum, document) => sum + document.estimatedTokens, 0)} tokens)`, ""];
    const localItems = result.items.filter((document) => !document.sourceName);
    const sourceItems = result.items.filter((document) => Boolean(document.sourceName));
    for (const document of localItems) {
      lines.push(`  ${document.llmdocPath}  [${document.frontmatter.kind}]`);
      lines.push(`    ${document.frontmatter.description}`);
    }
    if (sourceItems.length > 0) {
      const sourceTokens = sourceItems.reduce((sum, document) => sum + document.estimatedTokens, 0);
      lines.push("", `external sources/  (${sourceItems.length} shown of ${workspace.sourceDocuments.length} docs, ~${sourceTokens} tokens)`, "");
      for (const document of sourceItems) {
        lines.push(`  ${document.llmdocPath}  [${document.frontmatter.kind}]`);
        lines.push(`    ${document.frontmatter.description}`);
      }
    }
    if (workspace.sources.length > 0) {
      lines.push("", ...formatSourcesSection(workspace.sources));
    }
    lines.push("", ...formatPaginationSummary(result));
    return lines.join("\n");
  }

  const topics = [...workspace.topics.entries()]
    .map(([topic, docs]) => ({
      topic,
      docs,
      // 无入口节点:topic 摘要由文档名聚合,详情用 `index --topic` 看各文档 description。
      summary: docs.map((document) => document.basename.replace(/\.mdx$/, "")).join(", "),
      estimatedTokens: docs.reduce((sum, document) => sum + document.estimatedTokens, 0)
    }))
    .sort((left, right) => left.topic.localeCompare(right.topic));

  const rootSingletons = [...workspace.rootSingletons].sort((left, right) => left.llmdocPath.localeCompare(right.llmdocPath));
  const entries = [
    ...rootSingletons.map((document) => ({ type: "rootSingleton" as const, document })),
    ...topics.map((topic) => ({ type: "topic" as const, topic }))
  ];

  const result = paginate({
    items: entries,
    estimate: (entry) =>
      entry.type === "rootSingleton"
        ? estimateTokens(JSON.stringify(toRootSingletonSummary(entry.document)))
        : estimateTokens(JSON.stringify(toTopicSummary(entry.topic))),
    options
  });

  if (options.json) {
    return {
      root: "llmdoc",
      rootSingletons: result.items
        .filter((entry) => entry.type === "rootSingleton")
        .map((entry) => toRootSingletonSummary(entry.document)),
      topics: result.items.filter((entry) => entry.type === "topic").map((entry) => toTopicSummary(entry.topic)),
      ...(sourceSummaries.length > 0 ? { sources: sourceSummaries } : {}),
      pagination: paginationMetadata(result)
    };
  }

  const lines = [`llmdoc/  (${workspace.documents.length} docs, ~${workspace.documents.reduce((sum, document) => sum + document.estimatedTokens, 0)} tokens)`, ""];
  for (const entry of result.items) {
    if (entry.type === "rootSingleton") {
      lines.push(`  ${entry.document.basename}  [${entry.document.frontmatter.kind}]`);
      lines.push(`    ${entry.document.frontmatter.description}`);
      lines.push("");
      continue;
    }
    lines.push(`  ${entry.topic.topic}/  (${entry.topic.docs.length} docs, ~${entry.topic.estimatedTokens} tokens)`);
    lines.push(`    ${entry.topic.summary}`);
  }
  if (workspace.sources.length > 0) {
    lines.push("", ...formatSourcesSection(workspace.sources));
  }
  lines.push("", ...formatPaginationSummary(result));
  if (workspace.sources.length > 0) {
    const firstSource = workspace.sources[0]!.name;
    lines.push(
      `hint: use \`npx -y @tokenroll/llmdoc tree --docs\` to expand documents; \`... index --topic @${firstSource}\` to inspect a source; \`... status --refresh\` to sync git sources`
    );
  } else {
    lines.push("hint: use `npx -y @tokenroll/llmdoc tree --docs` to expand documents; use `... index --topic <t>` for metadata");
  }
  return lines.join("\n");
}

export function formatSourcesSection(sources: readonly LoadedSource[]): string[] {
  const lines = [`sources  (${sources.length} configured)`];
  for (const source of sources) {
    const spec =
      source.kind === "git"
        ? `git ${source.target}${source.ref ? `#${source.ref}` : ""}${source.dir ? `:${source.dir}` : ""}`
        : `path ${source.target}${source.dir ? `:${source.dir}` : ""}`;
    if (source.status === "ready") {
      const details = [`${source.documents.length} doc(s)`];
      if (source.kind === "git") {
        if (source.lastSyncedAt) {
          details.push(`synced ${formatRelativeAge(source.lastSyncedAt)}`);
        }
        if (source.stale) {
          details.push("stale");
        }
      } else if (source.isSubmodule) {
        details.push("submodule");
      }
      if (source.revision) {
        details.push(source.pinned ? `pinned at ${source.revision.slice(0, 7)}` : `at ${source.revision.slice(0, 7)}`);
      }
      lines.push(`  @${source.name}  ${spec}  (${details.join(", ")})`);
      if (source.error) {
        lines.push(`    warning: last refresh failed: ${source.error}`);
      }
    } else {
      lines.push(`  @${source.name}  ${spec}  [${source.status}]`);
      if (source.error) {
        lines.push(`    reason: ${source.error}`);
      }
      if (source.remedy) {
        lines.push(`    remedy: ${source.remedy}`);
      }
    }
  }
  return lines;
}

function formatRelativeAge(isoTimestamp: string): string {
  const timestamp = Date.parse(isoTimestamp);
  if (Number.isNaN(timestamp)) {
    return isoTimestamp;
  }
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 48) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function toDocumentSummary(document: ParsedDocument): object {
  return {
    path: formatDocumentPath(document),
    kind: document.frontmatter.kind,
    description: document.frontmatter.description,
    topic: document.topic,
    ...(document.sourceName ? { source: document.sourceName } : {})
  };
}

function toRootSingletonSummary(document: ParsedDocument): object {
  return {
    path: formatDocumentPath(document),
    kind: document.frontmatter.kind,
    description: document.frontmatter.description
  };
}

function toTopicSummary(topic: {
  topic: string;
  docs: ParsedDocument[];
  summary: string;
  estimatedTokens: number;
}): object {
  return {
    topic: topic.topic,
    summary: topic.summary,
    documentCount: topic.docs.length,
    estimatedTokens: topic.estimatedTokens
  };
}
