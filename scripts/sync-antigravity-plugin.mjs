// Rebuild the published directories from the Claude authoring surface.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const root = fileURLToPath(new URL("../", import.meta.url));
const plugin = path.join(root, "plugins/antigravity");
const staging = fs.mkdtempSync(path.join(plugin, ".sync-"));
try {
  for (const skill of ["llmdoc", "init", "update", "prune", "upgrade"]) {
    fs.cpSync(path.join(root, "skills", skill), path.join(staging, "skills", skill), { recursive: true });
  }
  fs.mkdirSync(path.join(staging, "agents"));
  for (const name of ["investigator", "recorder", "reflector"]) {
    const file = `${name}.md`;
    const { data, content } = matter.read(path.join(root, "agents", file));
    const header = [
      "---", `name: ${name}`, `description: ${JSON.stringify(data.description)}`,
      "model: inherit", "mainAgent: false", "subagent: true", "commandExecutionPolicy: sandbox", "---", ""
    ].join("\n");
    fs.writeFileSync(path.join(staging, "agents", file), header + content);
  }

  for (const directory of ["skills", "agents"]) {
    const target = path.join(plugin, directory);
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(path.join(staging, directory), target);
  }
  fs.mkdirSync(path.join(plugin, "assets"), { recursive: true });
  fs.copyFileSync(path.join(root, "website/public/favicon.svg"), path.join(plugin, "assets/logo.svg"));
  const manifestPath = path.join(plugin, "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = JSON.parse(fs.readFileSync(path.join(root, "cli/package.json"), "utf8")).version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
console.log("Antigravity skills, agents, logo and version synchronized.");
