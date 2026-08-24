import path from "node:path";

import { CliError } from "./errors.js";
import { DocumentKind } from "../types.js";

const DOCUMENT_KINDS: DocumentKind[] = ["architecture", "guide", "reference"];

export interface DocTargetShape {
  repoRelativePath: string;
  llmdocPath: string;
  segments: string[];
  basename: string;
  topic: string | null;
  isRootSingleton: boolean;
}

export function parseDocTargetShape(repoRelativePath: string): DocTargetShape {
  if (!repoRelativePath.startsWith("llmdoc/")) {
    throw new CliError("目标必须位于 llmdoc/ 下。");
  }
  if (!repoRelativePath.endsWith(".mdx")) {
    throw new CliError("目标必须是 .mdx 文档。");
  }
  const llmdocPath = repoRelativePath.slice("llmdoc/".length);
  const segments = llmdocPath.split("/");
  if (segments.length !== 1 && segments.length !== 2) {
    throw new CliError("V3 文档路径仅允许根 singleton 或 topic/file 两层。");
  }
  const basename = path.posix.basename(llmdocPath);
  const topic = segments.length === 2 ? (segments[0] ?? null) : null;
  const isRootSingleton = segments.length === 1;
  return {
    repoRelativePath,
    llmdocPath,
    segments,
    basename,
    topic,
    isRootSingleton
  };
}

export function assertDocKindMatchesShape(shape: DocTargetShape): void {
  // V3 不设入口节点:topic 即纯目录,描述由 CLI 从文档 front matter 聚合。
  if (shape.basename === "index.mdx") {
    throw new CliError("V3 不使用 index.mdx 入口节点；请使用普通命名，topic 描述由 llmdoc tree 聚合。");
  }
}

export function validateMoveTargetShape(shape: DocTargetShape): void {
  assertDocKindMatchesShape(shape);
}

export function isDirectTopicDirectory(repoRelativePath: string): boolean {
  if (!repoRelativePath.startsWith("llmdoc/")) {
    return false;
  }
  const llmdocPath = repoRelativePath.slice("llmdoc/".length).replace(/\/+$/, "");
  const segments = llmdocPath.split("/").filter(Boolean);
  return segments.length === 1;
}

export function assertDocumentKind(input: string): DocumentKind {
  if ((DOCUMENT_KINDS as string[]).includes(input)) {
    return input as DocumentKind;
  }
  throw new CliError(`非法 kind: ${input}。允许值: ${DOCUMENT_KINDS.join(", ")}`);
}
