import path from "node:path";

import { CodeRef } from "../types.js";

const LINK_PATTERN = /(?<!!)\[[^\]]*]\(([^)]+)\)/g;
const CODE_REF_PATTERN = /<CodeRef\b([\s\S]*?)\/>/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;

export function extractTitle(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function extractLinks(body: string): string[] {
  const text = stripMarkdownLiterals(body);
  const links: string[] = [];
  for (const match of text.matchAll(LINK_PATTERN)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget) {
      continue;
    }
    if (
      rawTarget.startsWith("http://") ||
      rawTarget.startsWith("https://") ||
      rawTarget.startsWith("mailto:") ||
      rawTarget.startsWith("#")
    ) {
      continue;
    }
    const targetWithoutAnchor = rawTarget.split("#")[0] ?? rawTarget;
    const targetWithoutQuery = targetWithoutAnchor.split("?")[0] ?? targetWithoutAnchor;
    if (targetWithoutQuery) {
      links.push(targetWithoutQuery);
    }
  }
  return links;
}

export function extractCodeRefs(body: string): CodeRef[] {
  const text = stripMarkdownLiterals(body);
  const refs: CodeRef[] = [];
  for (const match of text.matchAll(CODE_REF_PATTERN)) {
    const attributes = parseCodeRefAttributes(match[1] ?? "");
    const codePath = attributes.path?.trim();
    if (!codePath) {
      continue;
    }
    refs.push({
      path: codePath,
      symbol: attributes.symbol?.trim() || undefined
    });
  }
  return refs;
}

export function resolveDocLink(sourceLlmdocPath: string, linkTarget: string): string {
  const sourceDir = path.posix.dirname(sourceLlmdocPath);
  return path.posix.normalize(path.posix.join(sourceDir, linkTarget));
}

export function stripFencedCodeBlocks(input: string): string {
  return input.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
}

export function stripMarkdownLiterals(input: string): string {
  return stripFencedCodeBlocks(input).replace(INLINE_CODE_PATTERN, "");
}

export function validateCodeRefTags(body: string): string[] {
  const text = stripMarkdownLiterals(body);
  const issues: string[] = [];
  for (const match of text.matchAll(/<CodeRef\b([\s\S]*?)\/?>/g)) {
    const raw = match[0] ?? "";
    const attributes = match[1] ?? "";
    if (!raw.endsWith("/>")) {
      issues.push("CodeRef 必须使用自闭合写法 <CodeRef ... />。");
      continue;
    }
    const attrMatches = [...attributes.matchAll(/([A-Za-z]+)="([^"]*)"/g)];
    const consumed = attrMatches.map((attr) => attr[0]).join(" ").trim();
    const normalized = attributes.replace(/\s+/g, " ").trim().replace(/\/$/, "").trim();
    if (normalized && consumed !== normalized) {
      issues.push("CodeRef 仅允许双引号属性 path 和可选 symbol。");
      continue;
    }
    const names = attrMatches.map((attr) => attr[1]!);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    if (duplicates.length > 0) {
      issues.push(`CodeRef 存在重复属性: ${[...new Set(duplicates)].join(", ")}`);
    }
    if (!names.includes("path")) {
      issues.push("CodeRef 缺少必填属性 path。");
    }
    for (const name of names) {
      if (name !== "path" && name !== "symbol") {
        issues.push(`CodeRef 存在未知属性: ${name}`);
      }
    }
  }
  return [...new Set(issues)];
}

function parseCodeRefAttributes(input: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of input.matchAll(/([A-Za-z]+)="([^"]*)"/g)) {
    attributes[match[1]!] = match[2] ?? "";
  }
  return attributes;
}
