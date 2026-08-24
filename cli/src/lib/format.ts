import path from "node:path";

import { PaginationResult, ParsedDocument, ValidationIssue } from "../types.js";

export function formatDocumentLine(document: ParsedDocument): string {
  return `llmdoc/${document.llmdocPath}  [${document.frontmatter.kind}]`;
}

export function formatPaginationSummary<T>(result: PaginationResult<T>): string[] {
  const lines = [
    `returned: ${result.returnedItems}/${result.totalItems} items (~${result.returnedEstimatedTokens}/${result.totalEstimatedTokens} tokens)`
  ];
  if (result.nextCursor) {
    lines.push(`cursor: ${result.nextCursor}`);
  }
  return lines;
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => {
      const location = issue.path ? ` (${issue.path})` : "";
      return `${issue.severity}: ${issue.code}${location} ${issue.message}`;
    })
    .join("\n");
}

export function toRepoDocPath(llmdocPath: string): string {
  return path.posix.join("llmdoc", llmdocPath);
}
