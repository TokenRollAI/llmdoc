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
  sourceName?: string | null;
  sourceRelativePath?: string | null;
  sourceMountPath?: string | null;
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

export interface GitSourceConfig {
  git: string;
  ref?: string;
  dir?: string;
  refresh?: string;
}

export interface PathSourceConfig {
  path: string;
  dir?: string;
  allowOutsideRoot?: boolean;
}

export type SourceConfig = GitSourceConfig | PathSourceConfig;

export interface LlmdocConfig {
  $schema?: string;
  schema: "llmdoc.config/v1" | "llmdoc.config/v2";
  sources?: Record<string, SourceConfig>;
  startup?: {
    remindSkill?: boolean;
    preload?: string[];
  };
}

export interface PreloadEntry {
  raw: string;
  normalized: string;
  kind: "local" | "source";
  sourceName: string | null;
}

export interface LoadedLlmdocConfig {
  exists: boolean;
  localConfigExists?: boolean;
  schemaVersion: 1 | 2 | null;
  config: LlmdocConfig | null;
  preloadPaths: string[];
  preloadEntries: PreloadEntry[];
  sources: Record<string, SourceConfig>;
  issues: ValidationIssue[];
  hasLocalPreloadErrors: boolean;
}

export type SourceStatus = "ready" | "missing" | "error";

export interface LoadedSource {
  name: string;
  kind: "git" | "path";
  target: string;
  gitUrl?: string;
  ref: string | null;
  dir: string | null;
  refreshIntervalMs?: number;
  configuredPath?: string;
  isSubmodule: boolean;
  status: SourceStatus;
  mountDir: string | null;
  docRootDir: string | null;
  revision: string | null;
  pinned: boolean;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  stale: boolean;
  error: string | null;
  remedy: string | null;
  documents: ParsedDocument[];
  issues: ValidationIssue[];
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
  llmdocConfig: LoadedLlmdocConfig;
  preloadIssues: ValidationIssue[];
  sources: LoadedSource[];
  sourcesByName: Map<string, LoadedSource>;
  sourceDocuments: ParsedDocument[];
  sourceDocumentsById: Map<string, ParsedDocument>;
  unparsedDocPaths?: Set<string>;
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
