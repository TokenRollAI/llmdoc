import fs from "node:fs";
import { Minimatch } from "minimatch";

import { CACHE_DIR, SEARCH_CACHE_FILE } from "./constants.js";
import { ensureDirectory, resolveInsideRoot } from "./fs.js";
import { formatDocumentPath, matchesDocumentTopic } from "./source-id.js";
import { ParsedDocument, WorkspaceData } from "../types.js";

interface SearchCacheEntry {
  llmdocPath: string;
  absolutePath?: string;
  mtimeMs: number;
  searchableText: string;
  wordCount: number;
}

interface SearchCacheFile {
  version: 3;
  entries: Record<string, SearchCacheEntry>;
}

export interface SearchResult {
  document: ParsedDocument;
  score: number;
  snippet: string;
}

export type SearchMode = "lexical" | "cjk-bigram-fallback";

export interface SearchResponse {
  results: SearchResult[];
  mode: SearchMode;
}

interface SearchToken {
  value: string;
  weight: number;
}

const WORD_SEGMENTER = new Intl.Segmenter("zh-CN", { granularity: "word" });
const CJK_CHARACTER = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,}/gu;
const QUERY_STOP_WORDS = new Set([
  "的",
  "了",
  "呢",
  "吗",
  "啊",
  "吧",
  "是",
  "在",
  "与",
  "和",
  "或",
  "及",
  "把",
  "被",
  "从",
  "到",
  "为",
  "怎么",
  "如何",
  "什么",
  "为何"
]);

export function searchDocuments(
  workspace: WorkspaceData,
  query: string,
  filters?: { topic?: string; kind?: string }
): SearchResponse {
  const normalizedQuery = query.trim().toLowerCase();
  const lexicalTokens = tokenizeQuery(query).map((value) => ({ value, weight: 1 }));
  const allDocuments = [...workspace.documents, ...workspace.sourceDocuments];
  // Persist only local workspace documents to the repository search cache so external private
  // source bodies and ~/.llmdoc paths are never copied into the consumer repository.
  const cache = loadSearchCache(workspace, workspace.documents);
  const filteredDocs = allDocuments.filter((document) => {
    if (filters?.topic && !matchesDocumentTopic(document, filters.topic)) {
      return false;
    }
    if (filters?.kind && document.frontmatter.kind !== filters.kind) {
      return false;
    }
    return true;
  });

  const lexicalResults = scoreDocuments(filteredDocs, cache, lexicalTokens, {
    minimumMatchedTokens: 1,
    normalizedQuery
  });
  if (lexicalResults.length > 0) {
    return {
      results: lexicalResults,
      mode: "lexical"
    };
  }

  const bigrams = cjkBigrams(query);
  if (bigrams.length === 0) {
    return {
      results: [],
      mode: "lexical"
    };
  }
  const minimumMatchedTokens = bigrams.length >= 4 ? Math.max(2, Math.ceil(bigrams.length * 0.25)) : 1;
  return {
    results: scoreDocuments(
      filteredDocs,
      cache,
      bigrams.map((value) => ({ value, weight: 0.55 })),
      { minimumMatchedTokens, normalizedQuery }
    ),
    mode: "cjk-bigram-fallback"
  };
}

function scoreDocuments(
  documents: ParsedDocument[],
  cache: SearchCacheFile,
  tokens: SearchToken[],
  options: { minimumMatchedTokens: number; normalizedQuery: string }
): SearchResult[] {
  if (tokens.length === 0) {
    return [];
  }

  const documentFrequency = new Map<string, number>();
  for (const token of tokens) {
    let count = 0;
    for (const document of documents) {
      const cacheKey = formatDocumentPath(document);
      const searchableText = cache.entries[cacheKey]?.searchableText ?? buildSearchableText(document);
      if (searchableText.includes(token.value)) {
        count += 1;
      }
    }
    documentFrequency.set(token.value, count);
  }

  return documents
    .map((document) => {
      const cacheKey = formatDocumentPath(document);
      const searchableText = cache.entries[cacheKey]?.searchableText ?? buildSearchableText(document);
      const wordCount = cache.entries[cacheKey]?.wordCount ?? countWords(searchableText);
      let score = 0;
      let matchedTokenCount = 0;

      for (const token of tokens) {
        const frequency = countSubstring(searchableText, token.value);
        if (frequency === 0) {
          continue;
        }
        matchedTokenCount += 1;
        const df = documentFrequency.get(token.value) ?? 0;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        score +=
          token.weight *
          idf *
          ((frequency * 2.2) / (frequency + 1.2 * (1 - 0.75 + 0.75 * (wordCount / 200))));
      }

      if (options.normalizedQuery.length > 1) {
        const phraseFrequency = countSubstring(searchableText, options.normalizedQuery);
        score += phraseFrequency * (tokens.length + 1) * 2;
      }

      return {
        document,
        score,
        matchedTokenCount,
        snippet: buildSnippet(
          document.body,
          tokens.map((token) => token.value)
        )
      };
    })
    .filter((entry) => entry.score > 0 && entry.matchedTokenCount >= options.minimumMatchedTokens)
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

function loadSearchCache(workspace: WorkspaceData, documents: readonly ParsedDocument[]): SearchCacheFile {
  const next: SearchCacheFile = {
    version: 3,
    entries: {}
  };
  const cachePath = resolveCachePath(workspace);
  const existing = cachePath ? readCache(cachePath) : null;

  for (const document of documents) {
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(document.absolutePath).mtimeMs;
    } catch {
      continue;
    }
    const cacheKey = formatDocumentPath(document);
    const cachedEntry = existing?.entries[cacheKey];
    if (
      existing?.version === 3 &&
      cachedEntry &&
      cachedEntry.mtimeMs === mtimeMs &&
      cachedEntry.absolutePath === document.absolutePath
    ) {
      next.entries[cacheKey] = cachedEntry;
      continue;
    }
    const searchableText = buildSearchableText(document);
    next.entries[cacheKey] = {
      llmdocPath: cacheKey,
      absolutePath: document.absolutePath,
      mtimeMs,
      searchableText,
      wordCount: countWords(searchableText)
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

function tokenizeQuery(input: string): string[] {
  const tokens: string[] = [];
  let singleCjkBuffer: string[] = [];
  const flushSingleCjkBuffer = (): void => {
    if (singleCjkBuffer.length > 0) {
      tokens.push(singleCjkBuffer.join(""));
      singleCjkBuffer = [];
    }
  };

  for (const part of WORD_SEGMENTER.segment(input.toLowerCase())) {
    const value = part.segment.trim();
    if (!part.isWordLike || !value) {
      flushSingleCjkBuffer();
      continue;
    }
    if (QUERY_STOP_WORDS.has(value)) {
      flushSingleCjkBuffer();
      continue;
    }
    if (CJK_CHARACTER.test(value)) {
      singleCjkBuffer.push(value);
      continue;
    }
    flushSingleCjkBuffer();
    tokens.push(value);
  }
  flushSingleCjkBuffer();
  return unique(tokens);
}

function cjkBigrams(input: string): string[] {
  const bigrams: string[] = [];
  for (const match of input.toLowerCase().matchAll(CJK_RUN)) {
    const characters = [...match[0]];
    for (let index = 0; index < characters.length - 1; index += 1) {
      bigrams.push(`${characters[index]}${characters[index + 1]}`);
    }
  }
  return unique(bigrams);
}

function countWords(input: string): number {
  let count = 0;
  for (const part of WORD_SEGMENTER.segment(input)) {
    if (part.isWordLike && part.segment.trim()) {
      count += 1;
    }
  }
  return count || 1;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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
