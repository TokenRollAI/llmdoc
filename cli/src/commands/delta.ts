import { CliError } from "../lib/errors.js";
import { analyzeDelta, parseScope } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";
import { formatPaginationSummary } from "../lib/format.js";
import { paginate, paginationMetadata } from "../lib/pagination.js";
import { estimateTokens } from "../lib/markdown.js";

interface DeltaOptions {
  cwd: string;
  json?: boolean;
  cursor?: string;
  budget?: number;
  limit?: number;
  scope?: string[];
}

export function runDelta(options: DeltaOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  let scope;
  try {
    scope = parseScope(options.scope, workspace);
  } catch (error) {
    throw new CliError((error as Error).message);
  }
  const delta = analyzeDelta(workspace, scope);
  const rows = [
    ...delta.impacts.map((impact) => ({ type: "impacted" as const, impact })),
    ...delta.needsReview.map((document) => ({ type: "needs-review" as const, impact: { document, changedCommittedPaths: [], dirtyPaths: [], needsReviewBecauseOf: [] } }))
  ];
  const paginated = paginate({
    items: rows,
    estimate: (row) =>
      estimateTokens(
        JSON.stringify({
          type: row.type,
          path: `llmdoc/${row.impact.document.llmdocPath}`,
          changedCommittedPaths: row.impact.changedCommittedPaths,
          dirtyPaths: row.impact.dirtyPaths
        })
      ),
    options
  });

  if (options.json) {
    return {
      suggestedMode: delta.suggestedMode,
      reasons: delta.reasons,
      degradedReason: delta.git.degradedReason,
      impacted: paginated.items
        .filter((row) => row.type === "impacted")
        .map((row) => ({
          path: `llmdoc/${row.impact.document.llmdocPath}`,
          changedCommittedPaths: row.impact.changedCommittedPaths,
          dirtyPaths: row.impact.dirtyPaths
        })),
      needsReview: paginated.items
        .filter((row) => row.type === "needs-review")
        .map((row) => `llmdoc/${row.impact.document.llmdocPath}`),
      unmapped: {
        committed: delta.unmappedCommittedPaths,
        dirty: delta.unmappedDirtyPaths
      },
      pagination: paginationMetadata(paginated)
    };
  }

  const lines = [`mode: ${delta.suggestedMode}`, `impacted: ${delta.impacts.length}, needs-review: ${delta.needsReview.length}`, ""];
  for (const row of paginated.items) {
    const prefix = row.type === "needs-review" ? "needs-review" : "impacted";
    lines.push(`${prefix}: llmdoc/${row.impact.document.llmdocPath}`);
    if (row.impact.changedCommittedPaths.length > 0) {
      lines.push(`  committed: ${row.impact.changedCommittedPaths.join(", ")}`);
    }
    if (row.impact.dirtyPaths.length > 0) {
      lines.push(`  dirty: ${row.impact.dirtyPaths.join(", ")}`);
    }
  }
  if (delta.unmappedCommittedPaths.length > 0 || delta.unmappedDirtyPaths.length > 0) {
    lines.push("");
    if (delta.unmappedCommittedPaths.length > 0) {
      lines.push(`unmapped committed: ${delta.unmappedCommittedPaths.join(", ")}`);
    }
    if (delta.unmappedDirtyPaths.length > 0) {
      lines.push(`unmapped dirty: ${delta.unmappedDirtyPaths.join(", ")}`);
    }
  }
  if (delta.reasons.length > 0) {
    lines.push("", `reasons: ${delta.reasons.join("; ")}`);
  }
  lines.push("", ...formatPaginationSummary(paginated));
  return lines.join("\n");
}
