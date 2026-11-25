import { describe, expect, test } from "vitest";

import type { DeltaState, GrowthState } from "../src/lib/state.js";
import { buildViewerEdges, projectViewerState } from "../src/lib/viewer-state.js";
import type { ParsedDocument, WorkspaceData } from "../src/types.js";

describe("viewer state projection", () => {
  test("deduplicates directed edges by requires > related > link and keeps reverse edges", () => {
    const alpha = makeDocument("topic/alpha.mdx", {
      requires: ["topic/beta.mdx"],
      related: ["topic/gamma.mdx", "topic/beta.mdx"],
      links: ["./beta.mdx", "./gamma.mdx", "./alpha.mdx", "./missing.mdx"]
    });
    const beta = makeDocument("topic/beta.mdx", { links: ["./alpha.mdx"] });
    const gamma = makeDocument("topic/gamma.mdx");
    const documents = [gamma, beta, alpha];
    const knownDocuments = new Map(documents.map((document) => [document.llmdocPath, document]));

    expect(buildViewerEdges(documents, knownDocuments)).toEqual([
      { from: "topic/alpha.mdx", to: "topic/beta.mdx", type: "requires" },
      { from: "topic/alpha.mdx", to: "topic/gamma.mdx", type: "related" },
      { from: "topic/beta.mdx", to: "topic/alpha.mdx", type: "link" }
    ]);
    expect(buildViewerEdges([...documents].reverse(), knownDocuments)).toEqual(buildViewerEdges(documents, knownDocuments));
  });

  test("projects stable DTOs with dirty > impacted > needs-review > fresh precedence", () => {
    const dirty = makeDocument("topic/dirty.mdx");
    const impacted = makeDocument("topic/impacted.mdx");
    const needsReview = makeDocument("topic/needs-review.mdx");
    const fresh = makeDocument("architecture.mdx");
    const documents = [needsReview, fresh, dirty, impacted];
    const workspace = makeWorkspace(documents);
    const delta: DeltaState = {
      git: {
        available: true,
        headRevision: "head",
        detached: false,
        inProgressOperation: null,
        baselineBehindHead: 1,
        committedChangedPaths: [],
        stagedPaths: [],
        unstagedPaths: [],
        untrackedPaths: [],
        degradedReason: null
      },
      impacts: [
        { document: dirty, changedCommittedPaths: [], dirtyPaths: ["src/dirty.ts"], needsReviewBecauseOf: [] },
        { document: impacted, changedCommittedPaths: ["src/impacted.ts"], dirtyPaths: [], needsReviewBecauseOf: [] }
      ],
      needsReview: [dirty, needsReview],
      dirtyDocuments: [dirty],
      unmappedCommittedPaths: [],
      unmappedDirtyPaths: [],
      suggestedMode: "deep",
      reasons: ["存在 dirty"],
      scopedDocuments: documents
    };
    const growth: GrowthState = {
      currentDocumentCount: 4,
      currentTotalEstimatedTokens: 40,
      baselineDocumentCount: 4,
      baselineTotalEstimatedTokens: 40,
      documentDelta: 0,
      tokenDelta: 0,
      exceedsGate: false
    };

    const state = projectViewerState({
      workspace,
      delta,
      growth,
      issues: [{ severity: "warning", code: "test.warning", message: "warning" }],
      revisionHealth: { relevantCommitsBehindHead: 0, metadataOnlyBehind: true },
      generatedAt: "2026-08-27T00:00:00.000Z"
    });

    expect(state.nodes.map((node) => [node.path, node.status])).toEqual([
      ["architecture.mdx", "fresh"],
      ["topic/dirty.mdx", "dirty"],
      ["topic/impacted.mdx", "impacted"],
      ["topic/needs-review.mdx", "needs-review"]
    ]);
    expect(state.baseline).toEqual({
      revision: "base",
      headRevision: "head",
      behindHead: 1,
      relevantBehindHead: 0,
      metadataOnlyBehind: true,
      degradedReason: null
    });
    expect(state.validate).toMatchObject({ ok: true, errors: 0, warnings: 1 });
    expect(state.generatedAt).toBe("2026-08-27T00:00:00.000Z");
  });
});

function makeDocument(
  llmdocPath: string,
  options: { requires?: string[]; related?: string[]; links?: string[] } = {}
): ParsedDocument {
  const topic = llmdocPath.includes("/") ? llmdocPath.split("/")[0]! : null;
  return {
    absolutePath: `/repo/llmdoc/${llmdocPath}`,
    repoPath: `llmdoc/${llmdocPath}`,
    llmdocPath,
    topic,
    basename: llmdocPath.split("/").at(-1)!,
    frontmatter: {
      description: llmdocPath,
      kind: "reference",
      relations: {
        requires: options.requires ?? [],
        related: options.related ?? []
      }
    },
    body: `# ${llmdocPath}\n`,
    raw: `# ${llmdocPath}\n`,
    title: llmdocPath,
    links: options.links ?? [],
    codeRefs: [],
    estimatedTokens: 10,
    lineCount: 1
  };
}

function makeWorkspace(documents: ParsedDocument[]): WorkspaceData {
  const documentsByLlmdocPath = new Map(documents.map((document) => [document.llmdocPath, document]));
  const topicDocuments = documents.filter((document) => document.topic === "topic");
  return {
    rootDir: "/repo",
    llmdocDir: "/repo/llmdoc",
    metaPath: "/repo/llmdoc/meta.json",
    documents,
    documentsByLlmdocPath,
    topics: new Map([["topic", topicDocuments]]),
    rootSingletons: documents.filter((document) => document.topic === null),
    meta: {
      schema: "llmdoc.meta/v3",
      baseline: { revision: "base", verifiedAt: "2026-08-27T00:00:00Z" },
      documents: Object.fromEntries(documents.map((document) => [document.llmdocPath, { validatedRevision: "base" }])),
      convergence: {
        capturedAt: "2026-08-27T00:00:00Z",
        source: "init",
        documentCount: documents.length,
        totalEstimatedTokens: 40
      }
    },
    llmdocConfig: {
      exists: false,
      schemaVersion: null,
      config: null,
      preloadPaths: [],
      preloadEntries: [],
      sources: {},
      issues: [],
      hasLocalPreloadErrors: false
    },
    preloadIssues: [],
    sources: [],
    sourcesByName: new Map(),
    sourceDocuments: [],
    sourceDocumentsById: new Map()
  };
}
