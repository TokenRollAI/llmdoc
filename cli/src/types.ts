export type DocumentKind = "architecture" | "guide" | "reference";

export interface DocumentFrontmatter {
  description: string;
  kind: DocumentKind;
  relations?: {
    requires?: string[];
    related?: string[];
  };
  code?: {
    paths?: string[];
  };
}

export interface CodeRef {
  path: string;
  symbol?: string;
}

export interface ParsedDocument {
  absolutePath: string;
  repoPath: string;
  llmdocPath: string;
  topic: string | null;
  basename: string;
  frontmatter: DocumentFrontmatter;
  body: string;
  raw: string;
  title: string | null;
  links: string[];
  codeRefs: CodeRef[];
  estimatedTokens: number;
  lineCount: number;
}

export interface MetaLedger {
  schema: "llmdoc.meta/v3";
  baseline: {
    revision: string;
    verifiedAt: string;
  };
  documents: Record<string, { validatedRevision: string | null }>;
  convergence: {
    capturedAt: string;
    source: "init" | "prune";
    documentCount: number;
    totalEstimatedTokens: number;
  };
}

export interface WorkspaceData {
  rootDir: string;
  llmdocDir: string;
  metaPath: string;
  documents: ParsedDocument[];
  documentsByLlmdocPath: Map<string, ParsedDocument>;
  topics: Map<string, ParsedDocument[]>;
  rootSingletons: ParsedDocument[];
  meta: MetaLedger | null;
  preloadIssues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface PaginationResult<T> {
  items: T[];
  totalItems: number;
  returnedItems: number;
  totalEstimatedTokens: number;
  returnedEstimatedTokens: number;
  nextCursor: string | null;
}

export interface OutputOptions {
  json?: boolean;
  cursor?: string;
  budget?: number;
  limit?: number;
}

export interface GitState {
  available: boolean;
  headRevision: string | null;
  detached: boolean;
  inProgressOperation: "merge" | "rebase" | "cherry-pick" | null;
  baselineBehindHead: number | null;
  committedChangedPaths: string[];
  stagedPaths: string[];
  unstagedPaths: string[];
  untrackedPaths: string[];
  degradedReason: string | null;
}

export interface DocumentImpact {
  document: ParsedDocument;
  changedCommittedPaths: string[];
  dirtyPaths: string[];
  needsReviewBecauseOf: string[];
}
