import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import { DocumentFrontmatter, ParsedDocument } from "../types.js";
import { resolveDocLink } from "./markdown.js";

export interface MoveMapping {
  oldLlmdocPath: string;
  newLlmdocPath: string;
}

export function updateDocumentForMove(document: ParsedDocument, mapping: MoveMapping[]): string {
  const frontmatter: DocumentFrontmatter = structuredClone(document.frontmatter);
  frontmatter.relations = updateRelations(frontmatter.relations, mapping);

  let body = document.body;
  body = rewriteMarkdownLinks({
    sourceLlmdocPathBefore: document.llmdocPath,
    sourceLlmdocPathAfter: rewriteLlmdocTarget(document.llmdocPath, mapping),
    body,
    mapping
  });

  return matter.stringify(body, frontmatter);
}

function updateRelations(
  relations: DocumentFrontmatter["relations"] | undefined,
  mapping: MoveMapping[]
): DocumentFrontmatter["relations"] | undefined {
  if (!relations) {
    return relations;
  }
  const patchPath = (input: string): string => rewriteLlmdocTarget(input, mapping);
  const next: NonNullable<DocumentFrontmatter["relations"]> = {};
  if (relations.requires?.length) {
    next.requires = relations.requires.map(patchPath);
  }
  if (relations.related?.length) {
    next.related = relations.related.map(patchPath);
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function rewriteMarkdownLinks(input: {
  sourceLlmdocPathBefore: string;
  sourceLlmdocPathAfter: string;
  body: string;
  mapping: MoveMapping[];
}): string {
  const { sourceLlmdocPathBefore, sourceLlmdocPathAfter, body, mapping } = input;
  const linkPattern = /(?<!!)\[([^\]]*)]\(([^)]+)\)/g;
  let openFence: { marker: "`" | "~"; length: number } | null = null;
  const parts = body.split(/(\r?\n)/);

  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }
      const fence = part.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        const token = fence[1]!;
        const marker = token[0] as "`" | "~";
        if (!openFence) {
          openFence = { marker, length: token.length };
        } else if (openFence.marker === marker && token.length >= openFence.length) {
          openFence = null;
        }
        return part;
      }
      if (openFence) {
        return part;
      }
      return rewriteOutsideInlineCode(part, (plainText) =>
        plainText.replace(linkPattern, (fullMatch, label: string, target: string) => {
          if (
            target.startsWith("http://") ||
            target.startsWith("https://") ||
            target.startsWith("mailto:") ||
            target.startsWith("#")
          ) {
            return fullMatch;
          }

          const { pathname, suffix } = splitLinkTarget(target);
          const resolvedBefore = resolveDocLink(sourceLlmdocPathBefore, pathname);
          const rewrittenTarget = rewriteLlmdocTarget(resolvedBefore, mapping);
          const sourceDirAfter = path.posix.dirname(sourceLlmdocPathAfter);
          const relativeAfter = path.posix.relative(sourceDirAfter, rewrittenTarget) || path.posix.basename(rewrittenTarget);
          return `[${label}](${relativeAfter}${suffix})`;
        })
      );
    })
    .join("");
}

function splitLinkTarget(target: string): { pathname: string; suffix: string } {
  const suffixOffsets = [target.indexOf("?"), target.indexOf("#")].filter((offset) => offset >= 0);
  const suffixOffset = suffixOffsets.length > 0 ? Math.min(...suffixOffsets) : target.length;
  return {
    pathname: target.slice(0, suffixOffset),
    suffix: target.slice(suffixOffset)
  };
}

function rewriteOutsideInlineCode(line: string, transform: (plainText: string) => string): string {
  const codeSpan = /(`+)(.*?)\1/g;
  let cursor = 0;
  let result = "";
  for (const match of line.matchAll(codeSpan)) {
    const offset = match.index ?? 0;
    result += transform(line.slice(cursor, offset));
    result += match[0];
    cursor = offset + match[0].length;
  }
  result += transform(line.slice(cursor));
  return result;
}

function rewriteLlmdocTarget(input: string, mapping: MoveMapping[]): string {
  for (const item of mapping) {
    if (input === item.oldLlmdocPath) {
      return item.newLlmdocPath;
    }
    if (input.startsWith(`${item.oldLlmdocPath}/`)) {
      return `${item.newLlmdocPath}${input.slice(item.oldLlmdocPath.length)}`;
    }
  }
  return input;
}

export function writeFileIfChanged(filePath: string, nextContent: string): void {
  const current = fs.readFileSync(filePath, "utf8");
  if (current !== nextContent) {
    fs.writeFileSync(filePath, nextContent);
  }
}
