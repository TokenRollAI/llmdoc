import { loadWorkspace } from "../lib/workspace.js";
import { matchesCodePathPattern } from "../lib/search.js";
import { CliError } from "../lib/errors.js";
import { OutputOptions, ParsedDocument } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { paginate, paginationMetadata } from "../lib/pagination.js";
import { normalizeRepoRelativePath, resolveInsideRoot } from "../lib/fs.js";
import { estimateTokens } from "../lib/markdown.js";

interface ContextOptions extends OutputOptions {
  cwd: string;
  files: string[];
}

export function runContext(options: ContextOptions): unknown {
  if (options.files.length === 0) {
    throw new CliError("context 需要至少一个 --files 输入。");
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
  const impacted = workspace.documents.filter((document) =>
    normalizedFiles.some((file) =>
      (document.frontmatter.code?.paths ?? []).some((pattern) => matchesCodePathPattern(pattern, file.normalized))
    )
  );

  const prerequisites = collectRequires(workspace, impacted);
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
      pagination: paginationMetadata(result)
    };
  }

  const lines: string[] = [`${impacted.length} documents impacted, ${prerequisites.length} recommended prerequisites:`, ""];
  for (const row of result.items) {
    const prefix = row.role === "requires" ? "  requires ->" : "  ";
    const document = row.document;
    lines.push(`${prefix} llmdoc/${document.llmdocPath}  [${document.frontmatter.kind}]`);
    lines.push(`    ${document.frontmatter.description}`);
  }
  lines.push("", ...formatPaginationSummary(result));
  return lines.join("\n");
}

function collectRequires(workspace: ReturnType<typeof loadWorkspace>, impacted: ParsedDocument[]): ParsedDocument[] {
  const seen = new Set(impacted.map((document) => document.llmdocPath));
  const queue = [...impacted];
  const results: ParsedDocument[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const requirement of current.frontmatter.relations?.requires ?? []) {
      if (seen.has(requirement)) {
        continue;
      }
      const next = workspace.documentsByLlmdocPath.get(requirement);
      if (!next) {
        continue;
      }
      seen.add(requirement);
      results.push(next);
      queue.push(next);
    }
  }

  return results.sort((left, right) => left.llmdocPath.localeCompare(right.llmdocPath));
}

function toPayload(document: ParsedDocument): object {
  return {
    path: `llmdoc/${document.llmdocPath}`,
    kind: document.frontmatter.kind,
    description: document.frontmatter.description
  };
}
