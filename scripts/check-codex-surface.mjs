#!/usr/bin/env node
// Codex 表面自检:替代暂不可用的第三方 plugin-scanner action。
// 校验官方 schema 必需字段、skills frontmatter、hooks 调用约定。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// 2) .agents/plugins/marketplace.json(entry 需 name/source/policy.installation/policy.authentication)
const marketplace = readJson(".agents/plugins/marketplace.json");
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

// 3) Codex skills:每个 SKILL.md 有 frontmatter name + description
const skillsRoot = path.join(root, ".agents/skills");
if (fs.existsSync(skillsRoot)) {
  for (const dir of fs.readdirSync(skillsRoot)) {
    const skillFile = path.join(skillsRoot, dir, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      errors.push(`.agents/skills/${dir}: 缺少 SKILL.md`);
      continue;
    }
    const head = fs.readFileSync(skillFile, "utf8").split("\n---")[0];
    if (!/^---/.test(head)) errors.push(`.agents/skills/${dir}/SKILL.md: 缺少 frontmatter`);
    if (!/\bname:/.test(head)) errors.push(`.agents/skills/${dir}/SKILL.md: frontmatter 缺少 name`);
    if (!/\bdescription:/.test(head)) errors.push(`.agents/skills/${dir}/SKILL.md: frontmatter 缺少 description`);
  }
}

// 4) hooks.json:合法 JSON 且所有命令使用 scoped 包名 + --no-install
const hooks = readJson("hooks/hooks.json");
if (hooks) {
  const commands = JSON.stringify(hooks).match(/"command":"([^"]+)"/g) ?? [];
  for (const raw of commands) {
    const command = raw.slice(11, -1);
    if (!command.startsWith("npx --no-install @tokenroll/llmdoc")) {
      errors.push(`hooks.json: 命令必须以 'npx --no-install @tokenroll/llmdoc' 开头: ${command}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`codex surface check: ${errors.length} error(s)`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log("codex surface check: ok");
