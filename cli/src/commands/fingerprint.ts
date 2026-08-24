import { CliError } from "../lib/errors.js";
import { updateMetaRevisions, writeMeta } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";

interface FingerprintOptions {
  cwd: string;
  json?: boolean;
  update?: string[];
  all?: boolean;
}

export function runFingerprint(options: FingerprintOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const targetPaths = options.update?.map((value) => (value.startsWith("llmdoc/") ? value.slice("llmdoc/".length) : value)) ?? [];

  if (options.all && targetPaths.length > 0) {
    throw new CliError("fingerprint 不能同时使用 --all 与 --update。");
  }

  if (!options.all && targetPaths.length === 0) {
    throw new CliError("fingerprint 需要 --all 或 --update <path...>。");
  }

  for (const docPath of targetPaths) {
    if (!workspace.documentsByLlmdocPath.has(docPath)) {
      throw new CliError(`文档不存在: ${docPath}`);
    }
  }

  try {
    const result = updateMetaRevisions({
      workspace,
      llmdocPaths: targetPaths,
      updateAll: Boolean(options.all)
    });
    writeMeta(workspace.metaPath, result.meta);

    if (options.json) {
      return {
        status: "success",
        updateAll: Boolean(options.all),
        updated: result.updatedPaths,
        baselineRevision: result.meta.baseline.revision
      };
    }
    return `fingerprint: updated ${result.updatedPaths.length} document(s)${options.all ? ` and baseline -> ${result.meta.baseline.revision}` : ""}`;
  } catch (error) {
    throw new CliError((error as Error).message);
  }
}
