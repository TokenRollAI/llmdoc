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
  try {
    const workspace = loadWorkspace(cwd);
    const delta = analyzeDelta(workspace);
    const lifecycle = source === "compact" ? "compact re-entry" : "cold start";
    const baseline = workspace.meta?.baseline.revision ? workspace.meta.baseline.revision.slice(0, 7) : "missing";
    const stale = delta.git.baselineBehindHead === null ? "unknown" : `${delta.git.baselineBehindHead} behind`;
    return `${lifecycle}; llmdoc yes; baseline ${baseline} (${stale}); impacted ${delta.impacts.length}; needs-review ${delta.needsReview.length}`;
  } catch {
    return `${source === "compact" ? "compact re-entry" : "cold start"}; llmdoc unavailable`;
  }
}

function runStop(cwd: string): object {
  try {
    const workspace = loadWorkspace(cwd);
    const delta = analyzeDelta(workspace);
    const shouldUpdate = delta.impacts.length > 0 || delta.unmappedCommittedPaths.length > 0 || delta.unmappedDirtyPaths.length > 0;
    return {
      continue: true,
      ...(shouldUpdate ? { systemMessage: `llmdoc: 可能需要 update。${delta.reasons.length > 0 ? ` 信号: ${delta.reasons.join("; ")}` : ""}` } : {})
    };
  } catch (error) {
    return {
      continue: true,
      systemMessage: `llmdoc hook degraded: ${(error as Error).message}`
    };
  }
}

function runCompact(): object {
  return {
    continue: true,
    systemMessage: "在 compact summary 中保留 active goal、loaded docs、key conclusions、next step，并写入 LLMDOC_STATE。"
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
