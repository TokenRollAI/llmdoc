import { computeGrowthState, analyzeDelta } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";

interface StatusOptions {
  cwd: string;
  json?: boolean;
}

export function runStatus(options: StatusOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const delta = analyzeDelta(workspace);
  const growth = computeGrowthState(workspace);

  if (options.json) {
    return {
      baseline: workspace.meta?.baseline.revision ?? null,
      head: delta.git.headRevision,
      commitsBehindHead: delta.git.baselineBehindHead,
      degradedReason: delta.git.degradedReason,
      documents: {
        total: workspace.documents.length,
        impacted: delta.impacts.length,
        needsReview: delta.needsReview.length,
        dirty: delta.dirtyDocuments.length
      },
      unmapped: {
        committed: delta.unmappedCommittedPaths,
        dirty: delta.unmappedDirtyPaths
      },
      growth
    };
  }

  const baseline = workspace.meta?.baseline.revision ?? "missing";
  const behind = delta.git.baselineBehindHead === null ? "unknown" : `${delta.git.baselineBehindHead} commits behind HEAD`;
  const unmapped = [...delta.unmappedCommittedPaths, ...delta.unmappedDirtyPaths];
  const growthLabel =
    growth.baselineDocumentCount === null
      ? `growth: ${growth.currentDocumentCount} docs, ~${growth.currentTotalEstimatedTokens} tokens (no convergence baseline)`
      : `growth: ${growth.currentDocumentCount} docs, ~${growth.currentTotalEstimatedTokens} tokens (baseline ${growth.baselineDocumentCount} docs, ~${growth.baselineTotalEstimatedTokens} tokens) — ${growth.exceedsGate ? "above gate" : "below gate"}`;

  const lines = [
    `baseline: ${baseline} (${behind})`,
    `documents: ${workspace.documents.length} total / ${delta.impacts.length} impacted / ${delta.needsReview.length} needs-review / ${delta.dirtyDocuments.length} dirty`
  ];
  if (unmapped.length > 0) {
    const shown = unmapped.slice(0, 5);
    const rest = unmapped.length - shown.length;
    lines.push(`unmapped changes (${unmapped.length}): ${shown.join(", ")}${rest > 0 ? ` … +${rest} more (--json 查看全部)` : ""}`);
  }
  lines.push(growthLabel);
  if (delta.git.degradedReason) {
    lines.push(`degraded: ${delta.git.degradedReason}`);
  }
  return lines.join("\n");
}
