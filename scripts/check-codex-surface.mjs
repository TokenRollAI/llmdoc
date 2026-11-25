#!/usr/bin/env node
// Codex 表面自检:替代暂不可用的第三方 plugin-scanner action。
// 校验官方 schema 必需字段、skills frontmatter、hooks 调用约定。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  } catch (error) {
    errors.push(`${rel}: 无法解析 JSON — ${error.message}`);
    return null;
  }
}

// 1) .codex-plugin/plugin.json(官方要求:name kebab-case、version、description;路径 ./ 开头且不逃逸)
const plugin = readJson(".codex-plugin/plugin.json");
if (plugin) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name ?? "")) errors.push("plugin.json: name 必须是 kebab-case");
  if (!plugin.version) errors.push("plugin.json: 缺少 version");
  if (!plugin.description) errors.push("plugin.json: 缺少 description");
  for (const key of ["skills", "hooks", "mcpServers", "apps"]) {
    const value = plugin[key];
    if (typeof value === "string" && (!value.startsWith("./") || value.includes(".."))) {
      errors.push(`plugin.json: ${key} 路径必须以 ./ 开头且不得逃逸插件根`);
    }
  }
  const skillsDir = typeof plugin.skills === "string" ? plugin.skills : "./skills/";
  if (!fs.existsSync(path.join(root, skillsDir))) errors.push(`plugin.json: skills 目录不存在: ${skillsDir}`);
}

// 2) Claude/Codex marketplace 身份一致；Codex entry 需 name/source/policy.installation/policy.authentication
const claudeMarketplace = readJson(".claude-plugin/marketplace.json");
const marketplace = readJson(".agents/plugins/marketplace.json");
const rootPackage = readJson("package.json");
const cliPackage = readJson("cli/package.json");
if (claudeMarketplace && marketplace) {
  const expectedMarketplaceName = "llmdoc-plugin";
  if (claudeMarketplace.name !== expectedMarketplaceName) {
    errors.push(`.claude-plugin/marketplace.json: name 必须是 ${expectedMarketplaceName}`);
  }
  if (marketplace.name !== expectedMarketplaceName) {
    errors.push(`.agents/plugins/marketplace.json: name 必须是 ${expectedMarketplaceName}`);
  }
  if (claudeMarketplace.name !== marketplace.name) {
    errors.push("Claude 与 Codex marketplace name 必须一致");
  }
}
if (marketplace) {
  for (const entry of marketplace.plugins ?? []) {
    const label = `marketplace.json[${entry.name ?? "?"}]`;
    if (!entry.name) errors.push(`${label}: 缺少 name`);
    if (!entry.source) errors.push(`${label}: 缺少 source`);
    if (entry.source?.source === "local" && !(entry.source.path ?? "").startsWith("./")) {
      errors.push(`${label}: local source.path 必须以 ./ 开头`);
    }
    if (!["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"].includes(entry.policy?.installation)) {
      errors.push(`${label}: policy.installation 非法`);
    }
    if (!entry.policy?.authentication) errors.push(`${label}: 缺少 policy.authentication`);
  }
}
const versionSurfaces = [
  ["package.json", rootPackage?.version],
  ["cli/package.json", cliPackage?.version],
  [".claude-plugin/plugin.json", readJson(".claude-plugin/plugin.json")?.version],
  [".claude-plugin/marketplace.json", claudeMarketplace?.plugins?.[0]?.version],
  [".codex-plugin/plugin.json", plugin?.version],
  ["plugins/antigravity/plugin.json", readJson("plugins/antigravity/plugin.json")?.version]
];
const expectedVersion = cliPackage?.version;
for (const [label, version] of versionSurfaces) {
  if (expectedVersion && version !== expectedVersion) {
    errors.push(`${label}: version ${version ?? "<missing>"} 与 cli/package.json ${expectedVersion} 不一致`);
  }
}

// 3) Claude/Codex skills:每个 SKILL.md 的 YAML frontmatter 可解析且有 name + description
function validateSkills(skillsDir) {
  const skillsRoot = path.join(root, skillsDir);
  if (!fs.existsSync(skillsRoot)) return;

  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const rel = path.posix.join(skillsDir, entry.name, "SKILL.md");
    const skillFile = path.join(root, rel);
    if (!fs.existsSync(skillFile)) {
      errors.push(`${path.posix.join(skillsDir, entry.name)}: 缺少 SKILL.md`);
      continue;
    }

    const source = fs.readFileSync(skillFile, "utf8");
    if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
      errors.push(`${rel}: 缺少 frontmatter`);
      continue;
    }

    let data;
    try {
      data = matter(source).data;
    } catch (error) {
      errors.push(`${rel}: frontmatter YAML 无法解析 — ${error.message}`);
      continue;
    }

    if (typeof data.name !== "string" || data.name.trim() === "") {
      errors.push(`${rel}: frontmatter 缺少有效 name`);
    }
    if (typeof data.description !== "string" || data.description.trim() === "") {
      errors.push(`${rel}: frontmatter 缺少有效 description`);
    }
  }
}

validateSkills("skills");
validateSkills(".agents/skills");

// 4) 三个角色跨宿主齐备；Reflector 只能写临时候选，不恢复 tracked reflection 树。
for (const agent of ["investigator", "reflector", "recorder"]) {
  for (const rel of [`agents/${agent}.md`, `.codex/agents/${agent}.toml`]) {
    if (!fs.existsSync(path.join(root, rel))) errors.push(`${rel}: 缺少 ${agent} 角色契约`);
  }
}
for (const rel of ["agents/worker.md", ".codex/agents/worker.toml"]) {
  if (fs.existsSync(path.join(root, rel))) errors.push(`${rel}: 不应恢复 V2 worker 角色`);
}
for (const rel of ["agents/reflector.md", ".codex/agents/reflector.toml"]) {
  if (!fs.existsSync(path.join(root, rel))) continue;
  const content = fs.readFileSync(path.join(root, rel), "utf8");
  if (!content.includes(".llmdoc-tmp/reflections/pending/")) {
    errors.push(`${rel}: Reflector 必须把候选限制在 .llmdoc-tmp/reflections/pending/`);
  }
  if (!content.includes("Never write tracked `llmdoc/`")) {
    errors.push(`${rel}: Reflector 必须显式禁止写 tracked llmdoc`);
  }
}
for (const rel of ["skills/llmdoc/SKILL.md", ".agents/skills/llmdoc/SKILL.md"]) {
  const content = fs.readFileSync(path.join(root, rel), "utf8");
  if (!content.includes("## Reflection Gate") || !content.includes(".llmdoc-tmp/reflections/pending/")) {
    errors.push(`${rel}: operating skill 缺少强信号 Reflection Gate`);
  }
}
for (const rel of ["skills/update/SKILL.md", ".agents/skills/update/SKILL.md"]) {
  const content = fs.readFileSync(path.join(root, rel), "utf8");
  if (!content.includes("--reflection") || !content.includes("pending candidate is an update signal")) {
    errors.push(`${rel}: update skill 缺少 reflection 候选触发契约`);
  }
}

// 5) Claude 是 canonical authoring surface；生成的 Codex skill/agent 正文必须保持一致。
// 宿主 front matter / TOML 包装可以不同，只比较实际指令正文。
for (const name of ["llmdoc", "init", "update", "prune", "upgrade"]) {
  const claudePath = `skills/${name}/SKILL.md`;
  const codexPath = `.agents/skills/${name}/SKILL.md`;
  const claudeBody = readMarkdownBody(claudePath);
  const codexBody = readMarkdownBody(codexPath);
  if (claudeBody !== null && codexBody !== null && claudeBody !== codexBody) {
    errors.push(`${codexPath}: 指令正文与 canonical ${claudePath} 不一致`);
  }
}

// Skill references are part of the executable prompt surface too. A mirrored SKILL.md
// is not sufficient when its conditionally loaded guidance is missing or stale.
for (const rel of ["llmdoc/references/knowledge-topology.md", "llmdoc/references/startup-config.md"]) {
  const claudePath = `skills/${rel}`;
  const codexPath = `.agents/skills/${rel}`;
  const claudeReference = readText(claudePath);
  const codexReference = readText(codexPath);
  if (
    claudeReference !== null &&
    codexReference !== null &&
    normalizeBody(claudeReference) !== normalizeBody(codexReference)
  ) {
    errors.push(`${codexPath}: reference 与 canonical ${claudePath} 不一致`);
  }
}

for (const rel of [
  "skills/init/SKILL.md",
  ".agents/skills/init/SKILL.md",
  "skills/update/SKILL.md",
  ".agents/skills/update/SKILL.md",
  "skills/prune/SKILL.md",
  ".agents/skills/prune/SKILL.md"
]) {
  const content = readText(rel);
  if (content !== null && !content.includes("../llmdoc/references/knowledge-topology.md")) {
    errors.push(`${rel}: 未按需路由到 knowledge-topology reference`);
  }
}

for (const name of ["init", "update", "prune"]) {
  for (const rel of [`skills/${name}/SKILL.md`, `.agents/skills/${name}/SKILL.md`]) {
    const content = readText(rel);
    if (content !== null && !content.includes("../llmdoc/references/startup-config.md")) {
      errors.push(`${rel}: 未按需路由到 startup-config reference`);
    }
  }
}

for (const rel of ["skills/llmdoc/SKILL.md", ".agents/skills/llmdoc/SKILL.md"]) {
  const content = readText(rel);
  if (content !== null && !content.includes("references/knowledge-topology.md")) {
    errors.push(`${rel}: operating skill 未暴露 knowledge-topology reference`);
  }
  if (content !== null && !content.includes("references/startup-config.md")) {
    errors.push(`${rel}: operating skill 未暴露 startup-config reference`);
  }
}

for (const rel of ["agents/recorder.md", ".codex/agents/recorder.toml"]) {
  const content = readText(rel);
  if (content !== null && !content.includes("knowledge-topology.md")) {
    errors.push(`${rel}: Recorder 未声明 knowledge-topology 加载条件`);
  }
}

for (const name of ["investigator", "reflector", "recorder"]) {
  const claudePath = `agents/${name}.md`;
  const codexPath = `.codex/agents/${name}.toml`;
  const claudeBody = readMarkdownBody(claudePath);
  const codexFile = readText(codexPath);
  const match = codexFile?.match(/developer_instructions = """\r?\n([\s\S]*?)"""\r?\nmodel\s*=/);
  if (codexFile !== null && !match) {
    errors.push(`${codexPath}: 无法解析 developer_instructions`);
  } else if (claudeBody !== null && match && normalizeBody(match[1]) !== claudeBody) {
    errors.push(`${codexPath}: 指令正文与 canonical ${claudePath} 不一致`);
  }
}

// 6) hooks.json:合法 JSON；npm alias 强制从 scoped registry package 解析 runtime，
// 避免消费仓库中同名但缺少 bin 的本地/file dependency 遮蔽 hook CLI。
const hooks = readJson("hooks/hooks.json");
if (hooks) {
  const runtime = "npx -y --package=@tokenroll/llmdoc-hook-runtime@npm:@tokenroll/llmdoc -- llmdoc hook";
  const expectedCommands = new Set([
    `${runtime} session-start`,
    `${runtime} stop`,
    `${runtime} compact`
  ]);
  const commands = (JSON.stringify(hooks).match(/"command":"([^"]+)"/g) ?? []).map((raw) => raw.slice(11, -1));
  for (const command of commands) {
    if (!expectedCommands.delete(command)) {
      errors.push(`hooks.json: 非法或重复 hook runtime 命令: ${command}`);
    }
  }
  for (const missing of expectedCommands) {
    errors.push(`hooks.json: 缺少防本地遮蔽的 hook runtime 命令: ${missing}`);
  }
}

if (errors.length > 0) {
  console.error(`codex surface check: ${errors.length} error(s)`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log("codex surface check: ok");

function readText(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch (error) {
    errors.push(`${rel}: 无法读取 — ${error.message}`);
    return null;
  }
}

function readMarkdownBody(rel) {
  const content = readText(rel);
  if (content === null) return null;
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    errors.push(`${rel}: 无法解析 front matter 边界`);
    return null;
  }
  return normalizeBody(match[1]);
}

function normalizeBody(content) {
  return content.replace(/\r\n/g, "\n").trim();
}
