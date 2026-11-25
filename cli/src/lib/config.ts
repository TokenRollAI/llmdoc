import fs from "node:fs";
import path from "node:path";

import type {
  LlmdocConfig,
  LoadedLlmdocConfig,
  LoadedSource,
  ParsedDocument,
  PreloadEntry,
  SourceConfig,
  ValidationIssue
} from "../types.js";
import { MAX_EXTERNAL_PRELOAD_BYTES } from "./constants.js";
import { normalizeRepoRelativePath, resolveInsideRoot } from "./fs.js";
import { validateLlmdocConfig } from "./schema.js";
import { formatDocumentPath, isSourceRef, isValidSourceAlias, normalizeSourceSubdir, parseSourceDocId } from "./source-id.js";
import { parseRefreshDurationMs, validateGitRef, validateGitSourceUrl } from "./sources.js";

export const LLMDOC_CONFIG_FILENAME = "llmdoc.config.json";
export const LLMDOC_LOCAL_CONFIG_FILENAME = "llmdoc.config.local.json";

interface ParsedSingleConfigFile {
  exists: boolean;
  fileName: string;
  schemaVersion: 1 | 2 | null;
  config: LlmdocConfig | null;
  sources: Record<string, SourceConfig>;
  declaredSourceAliases: Set<string>;
  issues: ValidationIssue[];
}

export function loadLlmdocConfig(
  rootDir: string,
  documentsByLlmdocPath?: ReadonlyMap<string, ParsedDocument>
): LoadedLlmdocConfig {
  const shared = parseSingleConfigFile(rootDir, LLMDOC_CONFIG_FILENAME, false);
  const local = parseSingleConfigFile(rootDir, LLMDOC_LOCAL_CONFIG_FILENAME, true);

  if (!shared.exists && !local.exists) {
    return {
      exists: false,
      localConfigExists: false,
      schemaVersion: null,
      config: null,
      preloadPaths: [],
      preloadEntries: [],
      sources: {},
      issues: [],
      hasLocalPreloadErrors: false
    };
  }

  const issues: ValidationIssue[] = [...shared.issues, ...local.issues];
  const mergedSources: Record<string, SourceConfig> = {
    ...shared.sources,
    ...local.sources
  };
  const declaredSourceAliases = new Set<string>([
    ...shared.declaredSourceAliases,
    ...local.declaredSourceAliases
  ]);

  const effectiveConfig = mergeEffectiveConfig(shared.config, local.config, mergedSources);
  if (!effectiveConfig) {
    return {
      exists: true,
      localConfigExists: local.exists,
      schemaVersion: null,
      config: null,
      preloadPaths: [],
      preloadEntries: [],
      sources: {},
      issues,
      hasLocalPreloadErrors: false
    };
  }

  const schemaVersion: 1 | 2 = effectiveConfig.schema === "llmdoc.config/v2" ? 2 : 1;
  const preloadEntries: PreloadEntry[] = [];
  const preloadPaths: string[] = [];
  const seen = new Set<string>();
  let hasLocalPreloadErrors = false;

  const preloadInputs: Array<{ rawPath: string; fileName: string }> = [
    ...(shared.config?.startup?.preload ?? []).map((rawPath) => ({ rawPath, fileName: LLMDOC_CONFIG_FILENAME })),
    ...(local.config?.startup?.preload ?? []).map((rawPath) => ({ rawPath, fileName: LLMDOC_LOCAL_CONFIG_FILENAME }))
  ];

  for (const { rawPath, fileName } of preloadInputs) {
    if (isSourceRef(rawPath)) {
      if (schemaVersion < 2) {
        hasLocalPreloadErrors = true;
        issues.push(
          configIssue(
            fileName,
            "config.startup.preload.path",
            `External source preload requires schema llmdoc.config/v2 with configured sources: ${rawPath}`
          )
        );
        continue;
      }
      let parsedSourceId;
      try {
        parsedSourceId = parseSourceDocId(rawPath);
      } catch (error) {
        hasLocalPreloadErrors = true;
        issues.push(configIssue(fileName, "config.startup.preload.path", (error as Error).message));
        continue;
      }
      if (!declaredSourceAliases.has(parsedSourceId.alias)) {
        hasLocalPreloadErrors = true;
        issues.push(
          configIssue(
            fileName,
            "config.startup.preload.undeclared-source",
            `startup.preload references an undeclared source: @${parsedSourceId.alias} (${rawPath})`
          )
        );
        continue;
      }
      if (seen.has(parsedSourceId.canonicalId)) {
        issues.push(
          configIssue(
            fileName,
            "config.startup.preload.duplicate",
            `startup.preload contains the same normalized document more than once; duplicate ignored: ${parsedSourceId.canonicalId}`,
            "warning"
          )
        );
        continue;
      }
      seen.add(parsedSourceId.canonicalId);
      preloadPaths.push(parsedSourceId.canonicalId);
      preloadEntries.push({
        raw: rawPath,
        normalized: parsedSourceId.canonicalId,
        kind: "source",
        sourceName: parsedSourceId.alias
      });
      continue;
    }

    let normalized: string;
    try {
      normalized = normalizePreloadPath(rawPath);
    } catch (error) {
      hasLocalPreloadErrors = true;
      issues.push(configIssue(fileName, "config.startup.preload.path", (error as Error).message));
      continue;
    }
    if (seen.has(normalized)) {
      issues.push(
        configIssue(
          fileName,
          "config.startup.preload.duplicate",
          `startup.preload contains the same normalized document more than once; duplicate ignored: llmdoc/${normalized}`,
          "warning"
        )
      );
      continue;
    }
    seen.add(normalized);
    if (documentsByLlmdocPath && !documentsByLlmdocPath.has(normalized)) {
      hasLocalPreloadErrors = true;
      issues.push(configIssue(fileName, "config.startup.preload.missing", `startup.preload document does not exist: llmdoc/${normalized}`));
      continue;
    }
    preloadPaths.push(normalized);
    preloadEntries.push({
      raw: rawPath,
      normalized,
      kind: "local",
      sourceName: null
    });
  }

  return {
    exists: true,
    localConfigExists: local.exists,
    schemaVersion,
    config: effectiveConfig,
    preloadPaths: hasLocalPreloadErrors ? [] : preloadPaths,
    preloadEntries: hasLocalPreloadErrors ? [] : preloadEntries,
    sources: mergedSources,
    issues,
    hasLocalPreloadErrors
  };
}

function parseSingleConfigFile(rootDir: string, fileName: string, allowOutsideRootPaths: boolean): ParsedSingleConfigFile {
  const configPath = path.join(rootDir, fileName);
  if (!fs.existsSync(configPath)) {
    return {
      exists: false,
      fileName,
      schemaVersion: null,
      config: null,
      sources: {},
      declaredSourceAliases: new Set(),
      issues: []
    };
  }

  let safeConfigPath: string;
  try {
    safeConfigPath = resolveInsideRoot(rootDir, fileName);
  } catch (error) {
    return {
      exists: true,
      fileName,
      schemaVersion: null,
      config: null,
      sources: {},
      declaredSourceAliases: new Set(),
      issues: [configIssue(fileName, "config.read", `The config file must remain inside the repository: ${(error as Error).message}`)]
    };
  }

  let input: unknown;
  try {
    input = JSON.parse(fs.readFileSync(safeConfigPath, "utf8"));
  } catch (error) {
    return {
      exists: true,
      fileName,
      schemaVersion: null,
      config: null,
      sources: {},
      declaredSourceAliases: new Set(),
      issues: [configIssue(fileName, "config.read", `JSON parse failed: ${(error as Error).message}`)]
    };
  }

  const unsupportedFutureVersion = detectUnsupportedFutureSchemaVersion(input);
  if (unsupportedFutureVersion) {
    return {
      exists: true,
      fileName,
      schemaVersion: null,
      config: null,
      sources: {},
      declaredSourceAliases: new Set(),
      issues: [
        configIssue(
          fileName,
          "config.schema.unsupported",
          `${fileName} uses schema ${unsupportedFutureVersion}, which is newer than this CLI supports (up to llmdoc.config/v2). Upgrade @tokenroll/llmdoc.`
        )
      ]
    };
  }

  const schemaErrors = validateLlmdocConfig(input);
  if (schemaErrors.length > 0) {
    return {
      exists: true,
      fileName,
      schemaVersion: null,
      config: null,
      sources: {},
      declaredSourceAliases: new Set(),
      issues: schemaErrors.map((message) => configIssue(fileName, "config.invalid", `Invalid config: ${message}`))
    };
  }

  const config = input as LlmdocConfig;
  const schemaVersion: 1 | 2 = config.schema === "llmdoc.config/v2" ? 2 : 1;
  const issues: ValidationIssue[] = [];
  const validSources: Record<string, SourceConfig> = {};
  const declaredSourceAliases = new Set<string>(Object.keys(config.sources ?? {}));

  if (schemaVersion === 2 && config.sources) {
    for (const [alias, rawSource] of Object.entries(config.sources)) {
      if (!isValidSourceAlias(alias)) {
        issues.push(
          configIssue(
            fileName,
            "config.sources.alias.invalid",
            `Invalid source alias "${alias}". Source aliases must match ^[a-z0-9][a-z0-9._-]{0,63}$.`
          )
        );
        continue;
      }

      if ("git" in rawSource) {
        const urlValidation = validateGitSourceUrl(rawSource.git);
        let sourceHasError = false;
        if (!urlValidation.ok) {
          issues.push(configIssue(fileName, "config.sources.git.invalid", `Source @${alias}: ${urlValidation.message}`));
          sourceHasError = true;
        }
        let normalizedRef: string | undefined;
        if (rawSource.ref !== undefined) {
          const refValidation = validateGitRef(rawSource.ref);
          if (!refValidation.ok) {
            issues.push(configIssue(fileName, "config.sources.ref.invalid", `Source @${alias}: ${refValidation.message}`));
            sourceHasError = true;
          } else {
            normalizedRef = refValidation.normalized;
          }
        }
        let normalizedDir: string | undefined;
        if (rawSource.dir !== undefined) {
          try {
            normalizedDir = normalizeSourceSubdir(rawSource.dir);
          } catch (error) {
            issues.push(configIssue(fileName, "config.sources.dir.invalid", `Source @${alias}: ${(error as Error).message}`));
            sourceHasError = true;
          }
        }
        if (rawSource.refresh !== undefined) {
          try {
            parseRefreshDurationMs(rawSource.refresh);
          } catch (error) {
            issues.push(configIssue(fileName, "config.sources.refresh.invalid", `Source @${alias}: ${(error as Error).message}`));
            sourceHasError = true;
          }
        }
        if (!sourceHasError && urlValidation.ok) {
          validSources[alias] = {
            git: urlValidation.normalized,
            ...(normalizedRef !== undefined ? { ref: normalizedRef } : {}),
            ...(normalizedDir !== undefined ? { dir: normalizedDir } : {}),
            ...(rawSource.refresh !== undefined ? { refresh: rawSource.refresh } : {})
          };
        }
      } else {
        let sourceHasError = false;
        let normalizedPath = rawSource.path.trim();
        if (allowOutsideRootPaths) {
          if (!normalizedPath || normalizedPath.includes("\0")) {
            issues.push(configIssue(fileName, "config.sources.path.invalid", `Source @${alias}: Invalid local path: ${rawSource.path}`));
            sourceHasError = true;
          }
        } else {
          try {
            normalizedPath = normalizeRepoRelativePath(rawSource.path);
            resolveInsideRoot(rootDir, normalizedPath, { allowMissing: true });
          } catch (error) {
            issues.push(configIssue(fileName, "config.sources.path.invalid", `Source @${alias}: ${(error as Error).message}`));
            sourceHasError = true;
          }
        }
        let normalizedDir: string | undefined;
        if (rawSource.dir !== undefined) {
          try {
            normalizedDir = normalizeSourceSubdir(rawSource.dir);
          } catch (error) {
            issues.push(configIssue(fileName, "config.sources.dir.invalid", `Source @${alias}: ${(error as Error).message}`));
            sourceHasError = true;
          }
        }
        if (!sourceHasError) {
          validSources[alias] = {
            path: normalizedPath,
            ...(normalizedDir !== undefined ? { dir: normalizedDir } : {}),
            ...(allowOutsideRootPaths ? { allowOutsideRoot: true } : {})
          };
        }
      }
    }
  }

  return {
    exists: true,
    fileName,
    schemaVersion,
    config,
    sources: validSources,
    declaredSourceAliases,
    issues
  };
}

function mergeEffectiveConfig(
  shared: LlmdocConfig | null,
  local: LlmdocConfig | null,
  mergedSources: Record<string, SourceConfig>
): LlmdocConfig | null {
  if (!shared && !local) {
    return null;
  }
  const schema: "llmdoc.config/v1" | "llmdoc.config/v2" =
    shared?.schema === "llmdoc.config/v2" || local?.schema === "llmdoc.config/v2"
      ? "llmdoc.config/v2"
      : "llmdoc.config/v1";
  const remindSkill =
    local?.startup?.remindSkill !== undefined
      ? local.startup.remindSkill
      : shared?.startup?.remindSkill;
  const preload = [
    ...(shared?.startup?.preload ?? []),
    ...(local?.startup?.preload ?? [])
  ];
  const hasStartup = Boolean(shared?.startup || local?.startup);
  return {
    schema,
    ...(schema === "llmdoc.config/v2" && Object.keys(mergedSources).length > 0 ? { sources: mergedSources } : {}),
    ...(hasStartup
      ? {
          startup: {
            ...(remindSkill !== undefined ? { remindSkill } : {}),
            ...(preload.length > 0 ? { preload } : {})
          }
        }
      : {})
  };
}

export function formatStartupPreloadDocuments(
  documents: readonly ParsedDocument[],
  options?: {
    skipped?: ReadonlyArray<{ id: string; reason: string }>;
    sourcesByName?: ReadonlyMap<string, LoadedSource>;
  }
): string {
  const skipped = [...(options?.skipped ?? [])];
  const emitted: ParsedDocument[] = [];
  let externalBytesUsed = 0;

  for (const document of documents) {
    if (document.sourceName) {
      const bodyBytes = Buffer.byteLength(document.body, "utf8");
      if (externalBytesUsed + bodyBytes > MAX_EXTERNAL_PRELOAD_BYTES) {
        skipped.push({
          id: formatDocumentPath(document),
          reason: `exceeded external preload size limit (${Math.round(MAX_EXTERNAL_PRELOAD_BYTES / 1024)} KiB); retrieve explicitly with npx -y @tokenroll/llmdoc show ${formatDocumentPath(document)}`
        });
        continue;
      }
      externalBytesUsed += bodyBytes;
    }
    emitted.push(document);
  }

  const lines: string[] = [];
  if (emitted.length > 0) {
    lines.push(
      `llmdoc startup preload begins (${emitted.length} document(s)). The configured bodies are provided directly below. If the final completion marker is visible, these bodies are complete and do not need another search/show; otherwise retrieve any missing document with npx -y @tokenroll/llmdoc show.`
    );
    for (const document of emitted) {
      const displayPath = formatDocumentPath(document);
      if (document.sourceName) {
        const source = options?.sourcesByName?.get(document.sourceName);
        const rev = source?.revision ? ` @ ${source.revision.slice(0, 7)}` : "";
        lines.push(
          "",
          `=== ${displayPath} [${document.frontmatter.kind}] (startup preload; external source @${document.sourceName}${rev}, read-only reference) ===`,
          document.body
        );
      } else {
        lines.push("", `=== ${displayPath} [${document.frontmatter.kind}] (startup preload) ===`, document.body);
      }
    }
  }

  if (skipped.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Skipped startup preload external document(s):");
    for (const entry of skipped) {
      lines.push(`- ${entry.id}: ${entry.reason}`);
    }
  }

  if (emitted.length > 0) {
    lines.push(
      "",
      skipped.length > 0
        ? `=== llmdoc startup preload complete (partial: ${skipped.length} external document(s) skipped) ===`
        : "=== llmdoc startup preload complete ==="
    );
  }

  return lines.join("\n");
}

export function formatCompactPreloadIndex(preloadPaths: readonly string[]): string {
  if (preloadPaths.length === 0) {
    return "";
  }
  return `Configured startup preload bodies were not re-injected after compaction. Document IDs: ${preloadPaths
    .map((preloadPath) => (isSourceRef(preloadPath) ? preloadPath : `llmdoc/${preloadPath}`))
    .join(", ")}. Retrieve a body with npx -y @tokenroll/llmdoc show only when the compacted context no longer contains what the task needs.`;
}

export function rewriteStartupPreloadForMove(
  config: LlmdocConfig,
  mapping: ReadonlyArray<{ oldLlmdocPath: string; newLlmdocPath: string }>
): { config: LlmdocConfig; changed: boolean } {
  const preload = config.startup?.preload;
  if (!preload || preload.length === 0) {
    return { config, changed: false };
  }

  const moveByPath = new Map(mapping.map((item) => [item.oldLlmdocPath, item.newLlmdocPath]));
  let changed = false;
  const rewritten = preload.map((rawPath) => {
    if (isSourceRef(rawPath)) {
      return rawPath;
    }
    let normalized: string;
    try {
      normalized = normalizePreloadPath(rawPath);
    } catch {
      return rawPath;
    }
    const nextPath = moveByPath.get(normalized);
    if (!nextPath) {
      return rawPath;
    }
    changed = true;
    const normalizedRaw = rawPath.trim().replaceAll("\\", "/");
    return normalizedRaw.startsWith("llmdoc/") ? `llmdoc/${nextPath}` : nextPath;
  });

  return {
    changed,
    config: changed
      ? {
          ...config,
          startup: {
            ...config.startup,
            preload: rewritten
          }
        }
      : config
  };
}

function detectUnsupportedFutureSchemaVersion(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const schema = (input as { schema?: unknown }).schema;
  if (typeof schema !== "string") {
    return null;
  }
  const match = schema.match(/^llmdoc\.config\/v(\d+)$/);
  if (!match) {
    return null;
  }
  const version = Number.parseInt(match[1]!, 10);
  return Number.isInteger(version) && version > 2 ? schema : null;
}

function normalizePreloadPath(rawPath: string): string {
  const trimmed = rawPath.trim().replaceAll("\\", "/");
  const withoutPrefix = trimmed.startsWith("llmdoc/") ? trimmed.slice("llmdoc/".length) : trimmed;
  const normalized = normalizeRepoRelativePath(withoutPrefix);
  if (!normalized.endsWith(".mdx")) {
    throw new Error(`startup.preload accepts only .mdx documents: ${rawPath}`);
  }
  return normalized;
}

function configIssue(
  fileName: string,
  code: string,
  message: string,
  severity: ValidationIssue["severity"] = "error"
): ValidationIssue {
  return {
    severity,
    code,
    path: fileName,
    message
  };
}
