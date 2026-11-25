import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const root = fileURLToPath(new URL("../", import.meta.url));
const plugin = path.join(root, "plugins/antigravity");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const entries = (dir) => fs.readdirSync(dir).sort();
const manifest = readJson(path.join(plugin, "plugin.json"));
assert.equal(manifest.$schema, "https://antigravity.google/schemas/v1/plugin.json");
assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
assert.equal(manifest.name, "llmdoc");
assert.equal(manifest.displayName, "llmdoc");
assert.equal(manifest.version, readJson(path.join(root, "cli/package.json")).version);
for (const text of [manifest.description, manifest.author.name, manifest.author.url, manifest.homepage, manifest.repository]) {
  assert.equal(typeof text, "string");
  assert.match(text, /\S/);
}
assert.ok(Array.isArray(manifest.suggestedPrompts));
assert.equal(manifest.suggestedPrompts.length, 3);
for (const prompt of manifest.suggestedPrompts) assert.match(prompt, /\S/);
assert.ok(Array.isArray(manifest.keywords) && manifest.keywords.length);
assert.equal(manifest.logo, "assets/logo.svg");
assert.deepEqual(fs.readFileSync(path.join(plugin, manifest.logo)), fs.readFileSync(path.join(root, "website/public/favicon.svg")));
assert.ok(fs.statSync(path.join(plugin, "README.md")).size > 0);

function compareTree(source, mirror) {
  assert.deepEqual(entries(mirror), entries(source), mirror);
  for (const name of entries(source)) {
    const file = path.join(source, name);
    const copy = path.join(mirror, name);
    if (fs.lstatSync(file).isDirectory()) {
      assert.ok(fs.lstatSync(copy).isDirectory(), copy);
      compareTree(file, copy);
    } else {
      assert.ok(fs.lstatSync(copy).isFile(), copy);
      assert.deepEqual(fs.readFileSync(copy), fs.readFileSync(file), copy);
    }
  }
}
const skills = path.join(plugin, "skills");
assert.deepEqual(entries(skills), ["init", "llmdoc", "prune", "update", "upgrade"]);
compareTree(path.join(root, "skills"), skills);

const agents = path.join(plugin, "agents");
assert.deepEqual(entries(agents), ["investigator.md", "recorder.md", "reflector.md"]);
for (const name of entries(agents)) {
  const canonical = matter.read(path.join(root, "agents", name));
  const mirror = matter.read(path.join(agents, name));
  assert.deepEqual(mirror.data, {
    name: canonical.data.name,
    description: canonical.data.description,
    model: "inherit",
    mainAgent: false,
    subagent: true,
    commandExecutionPolicy: "sandbox"
  }, name);
  assert.equal(mirror.content, canonical.content, name);
}

const hook = "./scripts/llmdoc-hook.mjs";
assert.deepEqual(readJson(path.join(plugin, "hooks.json")), {
  llmdoc: { SessionStart: [{ type: "command", command: `node ${hook} session-start`, timeout: 30 }] }
});
if (process.platform !== "win32") assert.equal(fs.statSync(path.join(plugin, hook)).mode & 0o777, 0o755);
assert.match(fs.readFileSync(path.join(plugin, hook), "utf8"), /--package=@tokenroll\/llmdoc-hook-runtime@npm:@tokenroll\/llmdoc"/);

function runHook(input, options) {
  const result = spawnSync(process.execPath, [hook, "session-start"], {
    cwd: plugin, input, encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024 * 1024, ...options
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-agy-"));
try {
  const offline = { env: { ...process.env, PATH: temp }, timeout: 4_000 };
  assert.deepEqual(runHook(JSON.stringify({ cwd: temp, workspacePaths: [root] }), offline), {});
  assert.deepEqual(runHook("{", offline), {});
  assert.deepEqual(runHook("", offline), {});
  const fallback = runHook(JSON.stringify({ cwd: path.join(temp, "missing"), workspacePaths: [root] }), offline);
  assert.match(fallback.injectSteps[0].systemMessage.systemMessage, /^llmdoc hook degraded: [^\r\n]{1,160}$/);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
const startup = runHook(JSON.stringify({ cwd: root }));
const message = startup.injectSteps[0].systemMessage.systemMessage;
assert.doesNotMatch(message, /^llmdoc hook degraded:/, message);
assert.match(message, /llmdoc/);
console.log("Antigravity parity and SessionStart smoke checks passed.");

const validation = spawnSync("agy", ["plugin", "validate", "--strict", "plugins/antigravity", "--json"], {
  cwd: root, encoding: "utf8", timeout: 30_000
});
if (validation.error?.code === "ENOENT") {
  console.log("agy unavailable; skipped native validation.");
} else {
  if (validation.error) throw validation.error;
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  assert.deepEqual(JSON.parse(validation.stdout).findings, []);
  console.log("agy strict validation passed with zero findings.");
}
