#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function inject(message) {
  return { injectSteps: [{ systemMessage: { systemMessage: message } }] };
}

function isDirectory(candidate) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) return false;
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function sessionStart() {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return {};
  }
  const cwd = [payload?.cwd, payload?.workspacePaths?.[0]].find(isDirectory);
  if (!cwd || !fs.existsSync(path.join(cwd, "llmdoc"))) return {};

  const windows = process.platform === "win32";
  const result = spawnSync(windows ? "npx.cmd" : "npx", [
    "-y", "--package=@tokenroll/llmdoc-hook-runtime@npm:@tokenroll/llmdoc",
    "--", "llmdoc", "hook", "session-start"
  ], {
    cwd,
    shell: windows,
    encoding: "utf8",
    input: JSON.stringify({ source: "startup" }),
    timeout: 25_000,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    // Only report process metadata. npm diagnostics can include workspace data.
    const reason = result.error?.code ?? result.signal ?? `exit ${result.status}`;
    return inject(`llmdoc hook degraded: runtime ${reason}`);
  }
  const text = result.stdout.trim();
  return text ? inject(text) : {};
}

let response;
try {
  response = sessionStart();
} catch {
  response = inject("llmdoc hook degraded: unable to read startup context");
}
console.log(JSON.stringify(response));
