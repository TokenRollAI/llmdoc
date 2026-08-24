import { paginate, paginationMetadata } from "../lib/pagination.js";
import { loadWorkspace } from "../lib/workspace.js";
import { OutputOptions } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { estimateTokens } from "../lib/markdown.js";

interface TreeOptions extends OutputOptions {
  docs?: boolean;
  cwd: string;
}

export function runTree(options: TreeOptions): unknown {
  const workspace = loadWorkspace(options.cwd);

  if (options.docs) {
    const result = paginate({
      items: workspace.documents,
      estimate: (document) => estimateTokens(JSON.stringify(toDocumentSummary(document))),
      options
    });

    if (options.json) {
      return {
        root: "llmdoc",
        documents: result.items.map(toDocumentSummary),
        pagination: paginationMetadata(result)
      };
    }

    const lines = [`llmdoc/  (${workspace.documents.length} docs, ~${workspace.documents.reduce((sum, document) => sum + document.estimatedTokens, 0)} tokens)`, ""];
    for (const document of result.items) {
      lines.push(`  ${document.llmdocPath}  [${document.frontmatter.kind}]`);
      lines.push(`    ${document.frontmatter.description}`);
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
  lines.push("", ...formatPaginationSummary(result));
  lines.push("hint: `npx @tokenroll/llmdoc tree --docs` 展开文档级；`... index --topic <t>` 看文档元数据");
  return lines.join("\n");
}

function toDocumentSummary(document: ReturnType<typeof loadWorkspace>["documents"][number]): object {
  return {
    path: `llmdoc/${document.llmdocPath}`,
    kind: document.frontmatter.kind,
    description: document.frontmatter.description,
    topic: document.topic
  };
}

function toRootSingletonSummary(document: ReturnType<typeof loadWorkspace>["documents"][number]): object {
  return {
    path: `llmdoc/${document.llmdocPath}`,
    kind: document.frontmatter.kind,
    description: document.frontmatter.description
  };
}

function toTopicSummary(topic: {
  topic: string;
  docs: ReturnType<typeof loadWorkspace>["documents"];
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
