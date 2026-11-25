import { readRepositoryRevisionHealth } from "../lib/repository-health.js";
import { computeGrowthState, analyzeDelta } from "../lib/state.js";
import { refreshGitSources, toSourceSummary, triggerBackgroundRefreshIfNeeded } from "../lib/sources.js";
import { loadWorkspace } from "../lib/workspace.js";
import { formatSourcesSection } from "./tree.js";

interface StatusOptions {
  cwd: string;
  json?: boolean;
  refresh?: boolean;
}

export function runStatus(options: StatusOptions): { output: unknown; exitCode: number } {
  const workspace = loadWorkspace(options.cwd);
  let refreshFailed: Array<{ name: string; error: string }> = [];
  if (options.refresh && workspace.sources.length > 0) {
    refreshFailed = refreshGitSources(workspace, { force: true }).failed;
  } else if (workspace.sources.length > 0) {
    triggerBackgroundRefreshIfNeeded(workspace);
  }

  const delta = analyzeDelta(workspace);
  const growth = computeGrowthState(workspace);
  const relevantCommitsBehindHead = readRepositoryRevisionHealth(
    workspace.rootDir,
    workspace.meta?.baseline.revision ?? null,
    delta.git
  ).relevantCommitsBehindHead;
  const sourceSummaries = workspace.sources.map(toSourceSummary);
  const exitCode = options.refresh && refreshFailed.length > 0 ? 1 : 0;

  if (options.json) {
    return {
      exitCode,
      output: {
        baseline: workspace.meta?.baseline.revision ?? null,
        head: delta.git.headRevision,
        commitsBehindHead: delta.git.baselineBehindHead,
        relevantCommitsBehindHead,
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
        growth,
        ...(sourceSummaries.length > 0 ? { sources: sourceSummaries } : {})
      }
    };
  }

  const baseline = workspace.meta?.baseline.revision ?? "missing";
  const behind = formatBehindLabel(delta.git.baselineBehindHead, relevantCommitsBehindHead);
  const unmapped = [...delta.unmappedCommittedPaths, ...delta.unmappedDirtyPaths];
  const growthLabel =
    growth.baselineDocumentCount === null
      ? `growth: ${growth.currentDocumentCount} docs, ~${growth.currentTotalEstimatedTokens} tokens (no convergence baseline)`
      : `growth: ${growth.currentDocumentCount} docs, ~${growth.currentTotalEstimatedTokens} tokens (baseline ${growth.baselineDocumentCount} docs, ~${growth.baselineTotalEstimatedTokens} tokens) — ${growth.exceedsGate ? "above gate" : "below gate"}`;

  const lines = [
    `baseline: ${baseline} (${behind})`,
    `documents: ${workspace.documents.length} total / ${delta.impacts.length} impacted / ${delta.needsReview.length} needs-review / ${delta.dirtyDocuments.length} dirty`
  ];
  const unparsedCount = workspace.unparsedDocPaths?.size ?? 0;
  if (unparsedCount > 0) {
    lines.push(
      `warning: ${unparsedCount} local document(s) failed to parse and were omitted; run \`npx -y @tokenroll/llmdoc validate\` for details`
    );
  }
  if (unmapped.length > 0) {
    const shown = unmapped.slice(0, 5);
    const rest = unmapped.length - shown.length;
    lines.push(`unmapped changes (${unmapped.length}): ${shown.join(", ")}${rest > 0 ? ` … +${rest} more (use --json for all)` : ""}`);
  }
  lines.push(growthLabel);
  if (workspace.sources.length > 0) {
    lines.push("", ...formatSourcesSection(workspace.sources));
  }
  if (refreshFailed.length > 0) {
    lines.push(
      "",
      `refresh failed (${refreshFailed.length}): ${refreshFailed.map((entry) => `@${entry.name} (${entry.error})`).join("; ")}`
    );
  }
  if (delta.git.degradedReason) {
    lines.push(`degraded: ${delta.git.degradedReason}`);
  }
  return {
    exitCode,
    output: lines.join("\n")
  };
}

function formatBehindLabel(commitsBehindHead: number | null, relevantCommitsBehindHead: number | null): string {
  if (commitsBehindHead === null) {
    return "unknown";
  }
  if (commitsBehindHead > 0 && relevantCommitsBehindHead === 0) {
    return `${commitsBehindHead} commits behind HEAD, metadata-only; knowledge clean`;
  }
  if (commitsBehindHead > 0 && relevantCommitsBehindHead !== null) {
    return `${commitsBehindHead} commits behind HEAD, ${relevantCommitsBehindHead} relevant source commits`;
  }
  return `${commitsBehindHead} commits behind HEAD`;
}
