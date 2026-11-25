import fs from "node:fs";
import path from "node:path";

import { analyzeDelta } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";
import { formatCompactPreloadIndex, formatStartupPreloadDocuments, loadLlmdocConfig } from "../lib/config.js";
import { triggerBackgroundRefreshIfNeeded } from "../lib/sources.js";
import type { LoadedLlmdocConfig, ParsedDocument, WorkspaceData } from "../types.js";

interface HookOptions {
  cwd: string;
  mode: "session-start" | "stop" | "compact";
  stdin: string;
}

// Minimal SessionStart guidance; the complete protocol remains in the llmdoc skill.
const SESSION_START_GUIDANCE =
  "Operating guidance: Before broad exploration, planning, or documentation work, load the llmdoc skill and retrieve through the CLI instead of crawling the whole repository; align with the user before non-trivial plans or edits; proactively delegate to subagents (investigator for current-state and unfamiliar subsystems, recorder exclusively for stable llmdoc/ writes, reflector for workflow lessons); when a task produces durable knowledge, finish with /llmdoc:update.";

export function runHook(options: HookOptions): string {
  try {
    const hasLlmdoc = fs.existsSync(path.join(options.cwd, "llmdoc"));
    switch (options.mode) {
      case "session-start":
        // 未启用 llmdoc 的项目保持静默,不注入任何内容。
        return hasLlmdoc ? runSessionStart(options.cwd, options.stdin) : "";
      case "stop":
        return JSON.stringify(hasLlmdoc ? runStop(options.cwd) : { continue: true }, null, 2);
      case "compact":
        return JSON.stringify(hasLlmdoc ? runCompact() : { continue: true }, null, 2);
    }
  } catch (error) {
    if (options.mode === "session-start") {
      return `llmdoc hook degraded: ${String((error as Error).message || error).slice(0, 120)}`;
    }
    // 降级输出必须仍然满足 hook 输出 schema(continue + 可选 systemMessage),
    // 否则外层 JSON 校验会让 hook 非零退出,击穿 fail-open。
    return JSON.stringify(
      {
        continue: true,
        systemMessage: `llmdoc hook degraded: ${String((error as Error).message || error).slice(0, 200)}`
      },
      null,
      2
    );
  }
}

function runSessionStart(cwd: string, stdin: string): string {
  const source = inferSource(stdin);
  const lifecycle = source === "compact" ? "compact re-entry" : "cold start";
  try {
    const workspace = loadWorkspace(cwd);
    if (source === "cold" && workspace.sources.length > 0) {
      try {
        triggerBackgroundRefreshIfNeeded(workspace);
      } catch {
        // Background refresh must stay fail-open and never degrade SessionStart.
      }
    }
    const delta = analyzeDelta(workspace);
    const signal = summarizeHookDelta(delta);
    const pendingLessonCandidates = countPendingLessonCandidates(cwd);
    const parts = [`llmdoc ${lifecycle}`];
    // fingerprint/commit 正常收尾会让 HEAD 前进到仅修改 llmdoc/meta.json 的 follow-up commit。
    // 没有可执行影响时不展示 raw baseline 落后数，避免把知识面自身更新误报成需要再次 update。
    if (!signal.shouldUpdate) {
      parts.push("documents have no actionable impacts");
      if (pendingLessonCandidates > 0) {
        parts.push(`${pendingLessonCandidates} pending reflection candidate(s)`);
      }
    } else {
      const baseline = workspace.meta?.baseline.revision ? workspace.meta.baseline.revision.slice(0, 7) : "missing";
      const freshness = delta.git.baselineBehindHead === null ? "distance unknown" : delta.git.baselineBehindHead === 0 ? "at HEAD" : `${delta.git.baselineBehindHead} commit(s) behind HEAD`;
      parts.push(`baseline ${baseline}(${freshness})`);
      const summary = [
        signal.impactedCount > 0 ? `${signal.impactedCount} impacted document(s)` : null,
        signal.needsReviewCount > 0 ? `${signal.needsReviewCount} document(s) need review` : null,
        signal.unmappedCount > 0 ? `${signal.unmappedCount} unmapped code path(s)` : null
      ]
        .filter(Boolean)
        .join(", ");
      parts.push(`${summary} → inspect npx @tokenroll/llmdoc delta first`);
      if (pendingLessonCandidates > 0) {
        parts.push(`${pendingLessonCandidates} pending reflection candidate(s)`);
      }
    }

    const context = [parts.join("; ")];
    const startupConfig = workspace.llmdocConfig;
    if (startupConfig.config?.startup?.remindSkill ?? true) {
      context.push(SESSION_START_GUIDANCE);
    }
    appendStartupConfigIssues(context, startupConfig);
    const preloaded =
      source === "compact"
        ? formatCompactPreloadIndex(startupConfig.preloadPaths)
        : formatColdStartupPreload(workspace);
    if (preloaded) {
      context.push(preloaded);
    }
    return context.join("\n\n");
  } catch {
    const context = [`llmdoc ${lifecycle}; status read failed, retrieval remains available`];
    const startupConfig = loadLlmdocConfig(cwd);
    if (startupConfig.config?.startup?.remindSkill ?? true) {
      context.push(SESSION_START_GUIDANCE);
    }
    appendStartupConfigIssues(context, startupConfig);
    return context.join("\n\n");
  }
}

function formatColdStartupPreload(workspace: WorkspaceData): string {
  const resolved: ParsedDocument[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const entry of workspace.llmdocConfig.preloadEntries) {
    if (entry.kind === "local") {
      const doc = workspace.documentsByLlmdocPath.get(entry.normalized);
      if (doc) {
        resolved.push(doc);
      }
      continue;
    }

    const source = entry.sourceName ? workspace.sourcesByName.get(entry.sourceName) : undefined;
    if (!source || source.status !== "ready") {
      const detail = source?.error ?? "no local cache yet";
      const remedy = source?.remedy ?? `run npx -y @tokenroll/llmdoc show ${entry.normalized} or npx -y @tokenroll/llmdoc status --refresh`;
      skipped.push({
        id: entry.normalized,
        reason: `source @${entry.sourceName} is unavailable (${detail}; ${remedy})`
      });
      continue;
    }

    const doc = workspace.sourceDocumentsById.get(entry.normalized);
    if (!doc) {
      skipped.push({
        id: entry.normalized,
        reason: `document not found in @${entry.sourceName}${source.revision ? ` (${source.revision.slice(0, 7)})` : ""}`
      });
      continue;
    }
    resolved.push(doc);
  }

  return formatStartupPreloadDocuments(resolved, {
    skipped,
    sourcesByName: workspace.sourcesByName
  });
}

function appendStartupConfigIssues(context: string[], startupConfig: LoadedLlmdocConfig): void {
  const errors = startupConfig.issues.filter((issue) => issue.severity === "error");
  const warnings = startupConfig.issues.filter((issue) => issue.severity === "warning");
  if (errors.length > 0) {
    if (!startupConfig.config) {
      const unsupported = errors.find((issue) => issue.code === "config.schema.unsupported");
      context.push(
        unsupported
          ? `${unsupported.message} Preload was skipped and the default skill reminder remains active.`
          : "llmdoc.config.json could not be applied; preload was skipped and the default skill reminder remains active. Run npx @tokenroll/llmdoc validate for details."
      );
    } else if (startupConfig.hasLocalPreloadErrors) {
      context.push(
        "llmdoc.config.json has invalid startup.preload entries; preload was skipped while the valid remindSkill preference remained applied. Run npx @tokenroll/llmdoc validate for details."
      );
    } else {
      context.push(
        "llmdoc.config.json has invalid source configuration entries; affected sources were skipped while valid startup settings remained applied. Run npx @tokenroll/llmdoc validate for details."
      );
    }
  }
  const duplicateWarnings = warnings.filter((issue) => issue.code === "config.startup.preload.duplicate");
  if (duplicateWarnings.length > 0) {
    context.push(
      "llmdoc.config.json has warnings; normalized duplicate startup.preload entries were ignored. Run npx @tokenroll/llmdoc validate for details."
    );
  }
  const otherWarnings = warnings.filter((issue) => issue.code !== "config.startup.preload.duplicate");
  if (otherWarnings.length > 0) {
    context.push(
      `llmdoc.config.json reported ${otherWarnings.length} warning(s). Run npx @tokenroll/llmdoc validate for details.`
    );
  }
}

function runStop(cwd: string): object {
  try {
    const workspace = loadWorkspace(cwd);
    const delta = analyzeDelta(workspace);
    const signal = summarizeHookDelta(delta);
    const pendingLessonCandidates = countPendingLessonCandidates(cwd);
    if (!signal.shouldUpdate && pendingLessonCandidates === 0) {
      return { continue: true };
    }
    const summary = [
      signal.impactedCount > 0 ? `${signal.impactedCount} document(s) impacted by code changes` : null,
      signal.needsReviewCount > 0 ? `${signal.needsReviewCount} document(s) need review` : null,
      signal.unmappedCount > 0 ? `${signal.unmappedCount} code path(s) are not mapped to any document` : null,
      pendingLessonCandidates > 0 ? `${pendingLessonCandidates} reflection candidate(s) pending` : null
    ]
      .filter(Boolean)
      .join(", ");
    const reasons = delta.reasons.length > 0 ? `Signals: ${delta.reasons.join("; ")}` : "";
    const updateCommand = pendingLessonCandidates > 0 ? "/llmdoc:update --reflection" : "/llmdoc:update";
    const guidance =
      pendingLessonCandidates > 0
        ? signal.shouldUpdate
          ? "the workflow will read pending candidates; inspect code impact with npx @tokenroll/llmdoc delta first"
          : "the workflow will read pending candidates"
        : "inspect impact with npx @tokenroll/llmdoc delta first";
    return {
      continue: true,
      systemMessage: `llmdoc: ${summary}. Consider running ${updateCommand} (${guidance}). ${reasons}`.trim()
    };
  } catch (error) {
    return {
      continue: true,
      systemMessage: `llmdoc hook degraded: ${(error as Error).message}`
    };
  }
}

function summarizeHookDelta(delta: ReturnType<typeof analyzeDelta>): {
  shouldUpdate: boolean;
  impactedCount: number;
  needsReviewCount: number;
  unmappedCount: number;
} {
  const impactedCount = delta.impacts.length;
  const needsReviewCount = delta.needsReview.length;
  const unmappedCount = delta.unmappedCommittedPaths.length + delta.unmappedDirtyPaths.length;
  return {
    shouldUpdate: impactedCount > 0 || needsReviewCount > 0 || unmappedCount > 0,
    impactedCount,
    needsReviewCount,
    unmappedCount
  };
}

function runCompact(): object {
  return {
    continue: true,
    systemMessage:
      "Compaction is imminent. Preserve LLMDOC_STATE in the summary (active goal, llmdoc documents already read, key conclusions and invariants, user decisions, lesson_candidates, next step, open risks). After resuming, continue directly when that state is sufficient; do not replay tree/show."
  };
}

function countPendingLessonCandidates(cwd: string): number {
  const pendingDir = path.join(cwd, ".llmdoc-tmp", "reflections", "pending");
  try {
    return fs
      .readdirSync(pendingDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md")).length;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return 0;
    }
    throw error;
  }
}

function inferSource(stdin: string): "compact" | "cold" {
  const text = stdin.trim();
  if (!text) {
    return "cold";
  }
  try {
    const parsed = JSON.parse(text) as { source?: string };
    if (parsed.source === "compact") {
      return "compact";
    }
  } catch {
    if (/compact/i.test(text)) {
      return "compact";
    }
  }
  return "cold";
}
