import { loadWorkspace, validateWorkspace } from "../lib/workspace.js";
import { formatIssues } from "../lib/format.js";

interface ValidateOptions {
  cwd: string;
  json?: boolean;
}

export function runValidate(options: ValidateOptions): { ok: boolean; output: unknown; exitCode: number } {
  const workspace = loadWorkspace(options.cwd);
  const issues = validateWorkspace(workspace);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const payload = {
    ok: errors.length === 0,
    errors,
    warnings
  };

  if (options.json) {
    return {
      ok: payload.ok,
      output: payload,
      exitCode: payload.ok ? 0 : 1
    };
  }

  const output =
    issues.length === 0
      ? "validate: ok"
      : [errors.length ? "errors:" : "", errors.length ? formatIssues(errors) : "", warnings.length ? "warnings:" : "", warnings.length ? formatIssues(warnings) : ""]
          .filter(Boolean)
          .join("\n");

  return {
    ok: payload.ok,
    output,
    exitCode: payload.ok ? 0 : 1
  };
}
