import fs from "node:fs";
import path from "node:path";

import { findProjectRootOrNull, resolveInsideRoot } from "../lib/fs.js";
import { loadWorkspace, validateWorkspace } from "../lib/workspace.js";

interface UpgradeOptions {
  cwd: string;
  json?: boolean;
}

export async function runUpgrade(options: UpgradeOptions): Promise<unknown> {
  const rootDir = findProjectRootOrNull(options.cwd) ?? options.cwd;
  const configuredLlmdocDir = path.join(rootDir, "llmdoc");
  if (fs.existsSync(configuredLlmdocDir)) {
    resolveInsideRoot(rootDir, "llmdoc");
  }
  const report = fs.existsSync(configuredLlmdocDir) ? inspectLlmdocDirectory(configuredLlmdocDir) : inspectMissingLlmdoc();

  if (options.json) {
    return report;
  }

  const lines = [`status: ${report.status}`, `summary: ${report.summary}`];
  if (report.legacyPaths.length > 0) {
    lines.push(`legacy paths: ${report.legacyPaths.join(", ")}`);
  }
  if (report.targetStructure.length > 0) {
    lines.push("target structure:");
    for (const item of report.targetStructure) {
      lines.push(`  - ${item}`);
    }
  }
  lines.push(`recorder semantic migration required: ${report.requiresRecorderSemanticMigration ? "yes" : "no"}`);
  if (report.notes.length > 0) {
    lines.push("notes:");
    for (const note of report.notes) {
      lines.push(`  - ${note}`);
    }
  }
  return lines.join("\n");
}

function inspectMissingLlmdoc(): UpgradeReport {
  return {
    status: "no_change",
    summary: "当前仓库不存在 llmdoc/，没有可升级的 V2/V3 知识面。",
    legacyPaths: [],
    targetStructure: [],
    requiresRecorderSemanticMigration: false,
    notes: ["如需首次建立知识面，请走 init，而不是 upgrade。"]
  };
}

function inspectLlmdocDirectory(llmdocDir: string): UpgradeReport {
  const allFiles = walkFiles(llmdocDir);
  const legacyMarkers = ["index.md", "startup.md", "must", "overview", "memory", "records", "state/sync.md", "architecture", "guides", "reference"];
  const legacyPaths = [
    ...legacyMarkers.filter((entry) => fs.existsSync(path.join(llmdocDir, entry))),
    ...allFiles
      .filter((filePath) => filePath.endsWith(".md"))
      .map((filePath) => path.relative(llmdocDir, filePath).replaceAll(path.sep, "/"))
  ].filter((value, index, items) => items.indexOf(value) === index);
  const hasV3Meta = fs.existsSync(path.join(llmdocDir, "meta.json"));
  const hasMdx = walkFiles(llmdocDir).some((filePath) => filePath.endsWith(".mdx"));

  if (hasV3Meta && hasMdx && legacyPaths.length === 0) {
    const rootDir = path.dirname(llmdocDir);
    try {
      const workspace = loadWorkspace(rootDir);
      const errors = validateWorkspace(workspace).filter((issue) => issue.severity === "error");
      if (errors.length > 0) {
        return {
          status: "dry_run",
          summary: "检测到部分 V3 结构，但当前知识面未通过 V3 校验。",
          legacyPaths: [],
          targetStructure: ["修复现有 V3 结构错误后再判断是否需要 upgrade"],
          requiresRecorderSemanticMigration: false,
          notes: errors.slice(0, 5).map((issue) => `${issue.path ?? "unknown"}: ${issue.message}`)
        };
      }
    } catch (error) {
      return {
        status: "dry_run",
        summary: "检测到部分 V3 结构，但当前知识面无法稳定装载。",
        legacyPaths: [],
        targetStructure: ["修复现有 V3 结构错误后再判断是否需要 upgrade"],
        requiresRecorderSemanticMigration: false,
        notes: [(error as Error).message]
      };
    }
    return {
      status: "no_change",
      summary: "检测到现有知识面已经是 V3 结构，无需 upgrade。",
      legacyPaths: [],
      targetStructure: [],
      requiresRecorderSemanticMigration: false,
      notes: ["upgrade 当前只输出盘点，不会改写 V3 知识。"]
    };
  }

  if (legacyPaths.length === 0 && !hasV3Meta && !hasMdx) {
    return {
      status: "dry_run",
      summary: "检测到 llmdoc/ 目录，但没有明确的 V2 或 V3 结构特征。",
      legacyPaths: [],
      targetStructure: ["llmdoc/meta.json", "llmdoc/architecture.mdx", "llmdoc/<topic>/*.mdx (纯目录,无 index.mdx 入口节点)"],
      requiresRecorderSemanticMigration: false,
      notes: ["需要人工确认该目录是否为遗留知识面。"]
    };
  }

  return {
    status: "dry_run",
    summary: "检测到 legacy/V2 结构，需要 Recorder 参与语义迁移到 V3。",
    legacyPaths,
    targetStructure: ["llmdoc/meta.json", "llmdoc/architecture.mdx", "llmdoc/<topic>/*.mdx (纯目录,无 index.mdx 入口节点)"],
    requiresRecorderSemanticMigration: true,
    notes: [
      hasV3Meta ? "存在部分 V3 迹象，但 legacy 结构仍在，需要整理边界后再迁移。" : "未发现完整 V3 ledger，需要生成新的 meta.json baseline。",
      legacyPaths.includes("state/sync.md") ? "state/sync.md 需要迁移为 meta.json baseline.revision。" : "未发现 state/sync.md watermark。"
    ]
  };
}

interface UpgradeReport {
  status: "no_change" | "dry_run";
  summary: string;
  legacyPaths: string[];
  targetStructure: string[];
  requiresRecorderSemanticMigration: boolean;
  notes: string[];
}

function walkFiles(currentDir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(absolutePath));
    } else if (entry.isFile()) {
      results.push(absolutePath);
    }
  }
  return results;
}
