import { FRAGMENT_TOKEN_THRESHOLD } from "../lib/constants.js";
import { computeGrowthState } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";
import { ParsedDocument } from "../types.js";

interface PruneOptions {
  cwd: string;
  json?: boolean;
  report?: boolean;
}

interface CandidatePair {
  left: ParsedDocument;
  right: ParsedDocument;
  score: number;
  reasons: string[];
}

export function runPrune(options: PruneOptions): unknown {
  if (!options.report) {
    return options.json
      ? { status: "dry_run", message: "prune 当前仅支持 --report。", writable: false }
      : "prune 当前仅支持 --report。";
  }

  const workspace = loadWorkspace(options.cwd);
  const growth = computeGrowthState(workspace);
  const duplicateCandidates = findDuplicateCandidates(workspace.documents);
  const mergeCandidates = findMergeCandidates(workspace.documents);

  if (options.json) {
    return {
      status: "dry_run",
      writable: false,
      growth,
      duplicateCandidates: duplicateCandidates.map((candidate) => ({
        paths: [`llmdoc/${candidate.left.llmdocPath}`, `llmdoc/${candidate.right.llmdocPath}`],
        score: candidate.score,
        reasons: candidate.reasons
      })),
      mergeCandidates: mergeCandidates.map((candidate) => ({
        topic: candidate.topic,
        paths: candidate.documents.map((document) => `llmdoc/${document.llmdocPath}`),
        totalEstimatedTokens: candidate.totalEstimatedTokens,
        reasons: candidate.reasons
      }))
    };
  }

  const growthLine =
    growth.baselineDocumentCount === null
      ? `growth: ${growth.currentDocumentCount} docs, ~${growth.currentTotalEstimatedTokens} tokens (no convergence baseline)`
      : `growth: ${growth.currentDocumentCount} docs, ~${growth.currentTotalEstimatedTokens} tokens; baseline ${growth.baselineDocumentCount} docs, ~${growth.baselineTotalEstimatedTokens} tokens; delta ${growth.documentDelta}, ~${growth.tokenDelta} tokens; ${growth.exceedsGate ? "above gate" : "below gate"}`;

  const lines = [growthLine, ""];
  lines.push("duplicate candidates:");
  if (duplicateCandidates.length === 0) {
    lines.push("  none");
  } else {
    for (const candidate of duplicateCandidates) {
      lines.push(`  llmdoc/${candidate.left.llmdocPath} <-> llmdoc/${candidate.right.llmdocPath} (score ${candidate.score.toFixed(2)})`);
      lines.push(`    reasons: ${candidate.reasons.join("; ")}`);
    }
  }

  lines.push("", "fragment / merge candidates:");
  if (mergeCandidates.length === 0) {
    lines.push("  none");
  } else {
    for (const candidate of mergeCandidates) {
      lines.push(`  topic ${candidate.topic}: ${candidate.documents.length} small docs, ~${candidate.totalEstimatedTokens} tokens`);
      lines.push(`    paths: ${candidate.documents.map((document) => `llmdoc/${document.llmdocPath}`).join(", ")}`);
      lines.push(`    reasons: ${candidate.reasons.join("; ")}`);
    }
  }
  return lines.join("\n");
}

function findDuplicateCandidates(documents: ParsedDocument[]): CandidatePair[] {
  const results: CandidatePair[] = [];
  for (let index = 0; index < documents.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < documents.length; nextIndex += 1) {
      const left = documents[index]!;
      const right = documents[nextIndex]!;
      if (left.topic !== right.topic || left.frontmatter.kind !== right.frontmatter.kind) {
        continue;
      }
      const reasons: string[] = [];
      let score = 0;
      if (normalizeText(left.frontmatter.description) === normalizeText(right.frontmatter.description)) {
        reasons.push("description identical");
        score += 0.45;
      }
      const titleSimilarity = diceCoefficient(normalizeText(left.title ?? ""), normalizeText(right.title ?? ""));
      if (titleSimilarity >= 0.7) {
        reasons.push(`title similarity ${titleSimilarity.toFixed(2)}`);
        score += 0.25;
      }
      const codeOverlap = overlapRatio(left.frontmatter.code?.paths ?? [], right.frontmatter.code?.paths ?? []);
      if (codeOverlap > 0) {
        reasons.push(`code.paths overlap ${codeOverlap.toFixed(2)}`);
        score += 0.3 * codeOverlap;
      }
      const relationOverlap = overlapRatio(
        [...(left.frontmatter.relations?.requires ?? []), ...(left.frontmatter.relations?.related ?? [])],
        [...(right.frontmatter.relations?.requires ?? []), ...(right.frontmatter.relations?.related ?? [])]
      );
      if (relationOverlap > 0.5) {
        reasons.push(`relations overlap ${relationOverlap.toFixed(2)}`);
        score += 0.15;
      }
      if (score >= 0.72) {
        results.push({ left, right, score, reasons });
      }
    }
  }
  return results.sort((left, right) => right.score - left.score || left.left.llmdocPath.localeCompare(right.left.llmdocPath));
}

function findMergeCandidates(documents: ParsedDocument[]): Array<{
  topic: string;
  documents: ParsedDocument[];
  totalEstimatedTokens: number;
  reasons: string[];
}> {
  const grouped = new Map<string, ParsedDocument[]>();
  for (const document of documents) {
    if (!document.topic) {
      continue;
    }
    const bucket = grouped.get(document.topic) ?? [];
    bucket.push(document);
    grouped.set(document.topic, bucket);
  }

  const results: Array<{ topic: string; documents: ParsedDocument[]; totalEstimatedTokens: number; reasons: string[] }> = [];
  for (const [topic, docs] of grouped) {
    const smallDocs = docs.filter((document) => document.estimatedTokens <= FRAGMENT_TOKEN_THRESHOLD);
    if (smallDocs.length < 2) {
      continue;
    }
    const totalEstimatedTokens = smallDocs.reduce((sum, document) => sum + document.estimatedTokens, 0);
    results.push({
      topic,
      documents: smallDocs.sort((left, right) => left.llmdocPath.localeCompare(right.llmdocPath)),
      totalEstimatedTokens,
      reasons: ["multiple small documents within one topic", "candidate for merge or route simplification"]
    });
  }
  return results.sort((left, right) => right.documents.length - left.documents.length || left.topic.localeCompare(right.topic));
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  let overlap = 0;
  const counts = new Map<string, number>();
  for (const bigram of leftBigrams) {
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  for (const bigram of rightBigrams) {
    const count = counts.get(bigram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(bigram, count - 1);
    }
  }
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function bigrams(input: string): string[] {
  if (input.length < 2) {
    return [input];
  }
  const result: string[] = [];
  for (let index = 0; index < input.length - 1; index += 1) {
    result.push(input.slice(index, index + 2));
  }
  return result;
}

function overlapRatio(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      overlap += 1;
    }
  }
  return overlap / Math.min(leftSet.size, rightSet.size);
}
