import { CliError } from "../lib/errors.js";
import { isSourceRef } from "../lib/source-id.js";
import { updateMetaRevisions, writeMeta } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";

interface FingerprintOptions {
  cwd: string;
  json?: boolean;
  update?: string[];
  all?: boolean;
}

export function runFingerprint(options: FingerprintOptions): unknown {
  for (const value of options.update ?? []) {
    if (isSourceRef(value)) {
      throw new CliError(`External source documents (@...) are read-only and cannot be fingerprinted: ${value}`);
    }
  }
  const workspace = loadWorkspace(options.cwd);
  const targetPaths = options.update?.map((value) => (value.startsWith("llmdoc/") ? value.slice("llmdoc/".length) : value)) ?? [];

  if (options.all && targetPaths.length > 0) {
    throw new CliError("fingerprint cannot use --all and --update together.");
  }

  if (!options.all && targetPaths.length === 0) {
    throw new CliError("fingerprint requires --all or --update <path...>.");
  }

  for (const docPath of targetPaths) {
    if (!workspace.documentsByLlmdocPath.has(docPath)) {
      throw new CliError(`Document does not exist: ${docPath}`);
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
