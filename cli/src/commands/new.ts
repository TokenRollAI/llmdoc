import fs from "node:fs";
import path from "node:path";

import { parseDocTargetShape, assertDocKindMatchesShape, assertDocumentKind } from "../lib/doc-shape.js";
import { CliError } from "../lib/errors.js";
import { ensureDirectory, findProjectRoot, normalizeRepoRelativePath, resolveInsideRoot } from "../lib/fs.js";
import { packageRootFromImport } from "../lib/package-root.js";
import { loadWorkspace } from "../lib/workspace.js";
import { DocumentKind } from "../types.js";

interface NewOptions {
  cwd: string;
  path: string;
  kind: DocumentKind;
  description?: string;
  json?: boolean;
}

export function runNew(options: NewOptions): unknown {
  const rootDir = findProjectRoot(options.cwd);
  const repoRelativePath = normalizeDocDestination(options.path);
  const kind = assertDocumentKind(options.kind);
  const shape = parseDocTargetShape(repoRelativePath);
  assertDocKindMatchesShape(shape);
  const absolutePath = resolveInsideRoot(rootDir, repoRelativePath, { allowMissing: true });
  if (fs.existsSync(absolutePath)) {
    throw new CliError(`目标已存在: ${repoRelativePath}`);
  }

  ensureDirectory(absolutePath);
  const template = readTemplate();
  const title = path.basename(repoRelativePath, ".mdx").replaceAll("-", " ");
  // description 经 JSON.stringify 得到合法的 YAML double-quoted scalar,防止引号/冒号/换行破坏 front matter;
  // replace 一律用函数形式,避免 $& 等替换模式展开。
  const content = template
    .replace("__DESCRIPTION__", () => JSON.stringify(options.description ?? "TODO: 补充文档描述。"))
    .replace("__KIND__", () => kind)
    .replace("__TITLE__", () => title);

  fs.writeFileSync(absolutePath, content);
  syncMetaEntry(rootDir, shape.llmdocPath);

  if (options.json) {
    return {
      created: repoRelativePath
    };
  }
  return `created: ${repoRelativePath}`;
}

function normalizeDocDestination(input: string): string {
  const repoRelativePath = normalizeRepoRelativePath(input.startsWith("llmdoc/") ? input : `llmdoc/${input}`);
  if (!repoRelativePath.startsWith("llmdoc/") || !repoRelativePath.endsWith(".mdx")) {
    throw new CliError("new 只能创建 llmdoc/ 下的 .mdx 文档。");
  }
  return repoRelativePath;
}

function readTemplate(): string {
  const packageRoot = packageRootFromImport(import.meta.url);
  return fs.readFileSync(path.join(packageRoot, "templates", "doc.mdx"), "utf8");
}

function syncMetaEntry(rootDir: string, llmdocPath: string): void {
  const workspace = loadWorkspace(rootDir);
  if (!workspace.meta) {
    return;
  }
  if (!workspace.meta.documents[llmdocPath]) {
    // 新文档尚未经过任何验证,登记为 null;validatedRevision 只能由 fingerprint 在验证后写入。
    workspace.meta.documents[llmdocPath] = {
      validatedRevision: null
    };
    fs.writeFileSync(workspace.metaPath, `${JSON.stringify(workspace.meta, null, 2)}\n`);
  }
}
