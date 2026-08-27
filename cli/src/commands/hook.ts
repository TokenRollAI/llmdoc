import fs from "node:fs";
import path from "node:path";

import { analyzeDelta } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";

interface HookOptions {
  cwd: string;
  mode: "session-start" | "stop" | "compact";
  stdin: string;
}

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
    const delta = analyzeDelta(workspace);
    const signal = summarizeHookDelta(delta);
    const parts = [`llmdoc ${lifecycle}`];
    // fingerprint/commit 正常收尾会让 HEAD 前进到仅修改 llmdoc/meta.json 的 follow-up commit。
    // 没有可执行影响时不展示 raw baseline 落后数，避免把知识面自身更新误报成需要再次 update。
    if (!signal.shouldUpdate) {
      parts.push("文档无待处理影响");
      return parts.join("; ");
    }
    const baseline = workspace.meta?.baseline.revision ? workspace.meta.baseline.revision.slice(0, 7) : "缺失";
    const freshness = delta.git.baselineBehindHead === null ? "落后未知" : delta.git.baselineBehindHead === 0 ? "与 HEAD 同步" : `落后 HEAD ${delta.git.baselineBehindHead} commit`;
    parts.push(`baseline ${baseline}(${freshness})`);
    const summary = [
      signal.impactedCount > 0 ? `受影响 ${signal.impactedCount} 篇` : null,
      signal.needsReviewCount > 0 ? `待复核 ${signal.needsReviewCount} 篇` : null,
      signal.unmappedCount > 0 ? `未映射代码路径 ${signal.unmappedCount} 个` : null
    ]
      .filter(Boolean)
      .join(", ");
    parts.push(`${summary} → 建议先看 npx @tokenroll/llmdoc delta`);
    return parts.join("; ");
  } catch {
    return `llmdoc ${lifecycle}; 状态读取失败,检索不受影响`;
  }
}

function runStop(cwd: string): object {
  try {
    const workspace = loadWorkspace(cwd);
    const delta = analyzeDelta(workspace);
    const signal = summarizeHookDelta(delta);
    if (!signal.shouldUpdate) {
      return { continue: true };
    }
    const summary = [
      signal.impactedCount > 0 ? `${signal.impactedCount} 篇文档受代码变更影响` : null,
      signal.needsReviewCount > 0 ? `${signal.needsReviewCount} 篇文档需要复核` : null,
      signal.unmappedCount > 0 ? `${signal.unmappedCount} 个代码路径未映射到任何文档` : null
    ]
      .filter(Boolean)
      .join(", ");
    const reasons = delta.reasons.length > 0 ? `信号: ${delta.reasons.join("; ")}` : "";
    return {
      continue: true,
      systemMessage: `llmdoc: ${summary},建议运行 /llmdoc:update(先用 npx @tokenroll/llmdoc delta 查看影响面)。${reasons}`
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
      "即将 compact:请在 summary 中写入 LLMDOC_STATE(active goal、已读 llmdoc 文档、关键结论与不变量、用户决策、next step、open risks)。恢复后若该状态仍充分,直接继续,不要重放 tree/show。"
  };
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
