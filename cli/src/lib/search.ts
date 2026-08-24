import fs from "node:fs";
import { Minimatch } from "minimatch";

import { CACHE_DIR, SEARCH_CACHE_FILE } from "./constants.js";
import { ensureDirectory, resolveInsideRoot } from "./fs.js";
import { ParsedDocument, WorkspaceData } from "../types.js";

interface SearchCacheEntry {
  llmdocPath: string;
  mtimeMs: number;
  searchableText: string;
}

interface SearchCacheFile {
  version: 1;
  entries: Record<string, SearchCacheEntry>;
}

export interface SearchResult {
  document: ParsedDocument;
  score: number;
  snippet: string;
}

export function searchDocuments(
  workspace: WorkspaceData,
  query: string,
  filters?: { topic?: string; kind?: string }
): SearchResult[] {
  const tokens = tokenize(query);
  const cache = loadSearchCache(workspace);
  const filteredDocs = workspace.documents.filter((document) => {
    if (filters?.topic && document.topic !== filters.topic) {
      return false;
    }
    if (filters?.kind && document.frontmatter.kind !== filters.kind) {
      return false;
    }
    return true;
  });

  const documentFrequency = new Map<string, number>();
  for (const token of tokens) {
    let count = 0;
    for (const document of filteredDocs) {
      const searchableText = cache.entries[document.llmdocPath]?.searchableText ?? buildSearchableText(document);
      if (searchableText.includes(token)) {
        count += 1;
      }
    }
    documentFrequency.set(token, count);
  }

  return filteredDocs
    .map((document) => {
      const searchableText = cache.entries[document.llmdocPath]?.searchableText ?? buildSearchableText(document);
      const wordCount = tokenize(searchableText).length || 1;
      let score = 0;

      for (const token of tokens) {
        const frequency = countSubstring(searchableText, token);
        if (frequency === 0) {
          continue;
        }
        const df = documentFrequency.get(token) ?? 0;
        const idf = Math.log(1 + (filteredDocs.length - df + 0.5) / (df + 0.5));
        score += idf * ((frequency * 2.2) / (frequency + 1.2 * (1 - 0.75 + 0.75 * (wordCount / 200))));
      }

      return {
        document,
        score,
        snippet: buildSnippet(document.body, tokens)
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.document.llmdocPath.localeCompare(right.document.llmdocPath));
}

export function matchesCodePathPattern(pattern: string, repoRelativePath: string): boolean {
  const normalizedPattern = normalizeCodePathPattern(pattern);
  if (normalizedPattern === repoRelativePath) {
    return true;
  }
  if (!/[*?[\]{}]/.test(normalizedPattern)) {
    return false;
  }
  return new Minimatch(normalizedPattern, { dot: true, nocase: false }).match(repoRelativePath);
}

function normalizeCodePathPattern(pattern: string): string {
  let normalized = pattern.replaceAll("\\", "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return normalized.replace(/\/+$/, "");
}

function loadSearchCache(workspace: WorkspaceData): SearchCacheFile {
  const next: SearchCacheFile = {
    version: 1,
    entries: {}
  };
  const cachePath = resolveCachePath(workspace);
  const existing = cachePath ? readCache(cachePath) : null;

  for (const document of workspace.documents) {
    const stats = fs.statSync(document.absolutePath);
    const cachedEntry = existing?.entries[document.llmdocPath];
    if (cachedEntry && cachedEntry.mtimeMs === stats.mtimeMs) {
      next.entries[document.llmdocPath] = cachedEntry;
      continue;
    }
    next.entries[document.llmdocPath] = {
      llmdocPath: document.llmdocPath,
      mtimeMs: stats.mtimeMs,
      searchableText: buildSearchableText(document)
    };
  }

  if (cachePath) {
    try {
      ensureDirectory(cachePath);
      fs.writeFileSync(cachePath, JSON.stringify(next, null, 2));
    } catch {
      return next;
    }
  }
  return next;
}

function readCache(cachePath: string): SearchCacheFile | null {
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8")) as SearchCacheFile;
  } catch {
    return null;
  }
}

function resolveCachePath(workspace: WorkspaceData): string | null {
  try {
    return resolveInsideRoot(workspace.rootDir, `${CACHE_DIR}/${SEARCH_CACHE_FILE}`, { allowMissing: true });
  } catch {
    return null;
  }
}

function buildSearchableText(document: ParsedDocument): string {
  return [
    document.frontmatter.description,
    document.title ?? "",
    document.body
  ]
    .join("\n")
    .toLowerCase();
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff_-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildSnippet(body: string, tokens: string[]): string {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const loweredTokens = tokens.map((token) => token.toLowerCase());
  const line =
    lines.find((candidate) => loweredTokens.some((token) => candidate.toLowerCase().includes(token))) ??
    lines[0] ??
    "";
  return line.slice(0, 180);
}

function countSubstring(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let offset = 0;
  while (offset < haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index === -1) {
      break;
    }
    count += 1;
    offset = index + needle.length;
  }
  return count;
}
