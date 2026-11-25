import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentFrontmatter, GitSourceConfig, LoadedSource, ParsedDocument, SourceConfig, WorkspaceData } from "../types.js";
import {
  DEFAULT_SOURCE_COOLDOWN_MS, DEFAULT_SOURCE_COLD_WALL_TIMEOUT_MS, DEFAULT_SOURCE_GIT_TIMEOUT_MS,
  DEFAULT_SOURCE_LOCK_STALE_MS, DEFAULT_SOURCE_MAX_RETRIES, DEFAULT_SOURCE_REFRESH_MS,
  MAX_SOURCE_DOCUMENT_BYTES, MAX_SOURCE_DOCUMENTS
} from "./constants.js";
import { CliError } from "./errors.js";
import { isWithinRoot, normalizeRepoRelativePath, resolveInsideRoot, toPosixRelative } from "./fs.js";
import { parseYamlFrontmatter } from "./frontmatter.js";
import { estimateTokens, extractCodeRefs, extractLinks, extractTitle } from "./markdown.js";
import { packageRootFromImport } from "./package-root.js";
import { matchesCodePathPattern } from "./search.js";
import { isValidSourceAlias, normalizeSourceSubdir, parseSourceDocId } from "./source-id.js";

export function getLlmdocHomeDir(): string {
  return path.resolve(process.env.LLMDOC_HOME || path.join(os.homedir(), ".llmdoc"));
}

export function parseRefreshDurationMs(input: string | undefined): number {
  if (input === undefined) return DEFAULT_SOURCE_REFRESH_MS;
  const match = /^([1-9][0-9]*)([mhd])$/u.exec(input);
  const units: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  const duration = match ? Number(match[1]) * units[match[2]] : NaN;
  if (!Number.isSafeInteger(duration)) throw new CliError("Invalid refresh duration. Use a positive integer followed by m, h, or d.");
  return duration;
}

function hasControlChar(input: string): boolean {
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function validateGitRef(rawRef: string): { ok: true; normalized: string } | { ok: false; message: string } {
  const ref = rawRef.trim();
  if (
    !ref ||
    ref.startsWith("-") ||
    ref.startsWith("/") ||
    ref.endsWith("/") ||
    ref.endsWith(".") ||
    hasControlChar(ref) ||
    /[\s:~^?*[\\]/u.test(ref) ||
    ref.includes("..") ||
    ref.includes("@{") ||
    ref.includes("//")
  ) {
    return { ok: false, message: `Invalid Git source ref: ${rawRef}` };
  }
  return { ok: true, normalized: ref };
}

export function validateGitSourceUrl(rawUrl: string): { ok: true; normalized: string } | { ok: false; message: string } {
  const invalid = { ok: false as const, message: "Invalid Git URL. Use HTTP(S), SSH, file, or user@host:path without embedded credentials." };
  if (hasControlChar(rawUrl) || /[\s\\]/u.test(rawUrl) || rawUrl.startsWith("-")) return invalid;
  if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^\s?#]+$/u.test(rawUrl)) return { ok: true, normalized: rawUrl };
  if (!/^(?:https?|ssh|file):\/\//u.test(rawUrl)) return invalid;
  try {
    const url = new URL(rawUrl);
    if (url.password || (url.username && url.protocol !== "ssh:") || url.search || url.hash) return invalid;
    if (url.protocol !== "file:" && !url.hostname) return invalid;
    // Keep the SSH alias and transport spelling used by Git in the cache identity.
    return { ok: true, normalized: rawUrl };
  } catch {
    return invalid;
  }
}

export function isCommitSha(ref: string | undefined): boolean {
  return ref !== undefined && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(ref);
}

function sanitizeErrorMessage(error: unknown): string {
  const raw = String(error instanceof Error ? error.message : error)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s'"]+@/giu, "$1[redacted]@")
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s'"?#]+)[?#][^\s'"]*/giu, "$1?[redacted]");
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const primary =
    lines.find((line) => /^(?:fatal|error):/iu.test(line)) ??
    lines[0] ??
    "Unknown error";
  return primary.replace(/\.+$/u, "").slice(0, 240);
}

function envMs(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = Number(raw);
  return raw && Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : fallback;
}

function git(args: string[], cwd: string, deadline: number): string {
  const timeout = Math.min(envMs("LLMDOC_GIT_TIMEOUT_MS", DEFAULT_SOURCE_GIT_TIMEOUT_MS), deadline - Date.now());
  if (timeout <= 0) throw new Error("Git operation timed out");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes -o ConnectTimeout=10"
  };
  // A caller running inside a Git hook may point these at the consumer's worktree.
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) {
    delete env[key];
  }
  const result = spawnSync("git", [
    "-c", "protocol.ext.allow=never", "-c", "core.hooksPath=/dev/null", "-c", "submodule.recurse=false", ...args
  ], {
    cwd, encoding: "utf8", timeout, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"], env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(sanitizeErrorMessage(result.stderr || `Git exited with status ${result.status}`));
  return result.stdout.trim();
}

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function normalizedConfigDir(config: { dir?: string }): string | null {
  return config.dir !== undefined ? normalizeSourceSubdir(config.dir) : null;
}

function cachePaths(config: GitSourceConfig) {
  const dir = normalizedConfigDir(config);
  const key = hash(JSON.stringify([config.git, config.ref ?? null, dir]));
  const home = getLlmdocHomeDir();
  const cache = path.join(home, "sources", "v1", key);
  const mirror = path.join(home, "mirrors", "v1", hash(config.git) + ".git");
  return { cache, mirror, dir, statePath: path.join(cache, "state.json"), snapshots: path.join(cache, "snapshots") };
}

interface SnapshotState {
  url: string;
  ref: string | null;
  dir: string | null;
  currentSnapshot: string | null;
  revision: string | null;
  pinned: boolean;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  cooldownUntil: string | null;
}

function readState(config: GitSourceConfig): SnapshotState {
  const dir = normalizedConfigDir(config);
  const empty: SnapshotState = {
    url: config.git, ref: config.ref ?? null, dir, pinned: isCommitSha(config.ref), currentSnapshot: null, revision: null,
    lastSyncedAt: null, lastAttemptAt: null, lastError: null, cooldownUntil: null
  };
  const { statePath } = cachePaths(config);
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (
      state.url !== empty.url ||
      state.ref !== empty.ref ||
      (state.dir ?? null) !== empty.dir ||
      !(state.currentSnapshot === null || (typeof state.currentSnapshot === "string" && /^[a-zA-Z0-9_-]+$/u.test(state.currentSnapshot))) ||
      !(state.revision === null || isCommitSha(state.revision))
    ) {
      throw new Error("Invalid snapshot state");
    }
    for (const key of ["lastSyncedAt", "lastAttemptAt", "lastError", "cooldownUntil"]) {
      if (state[key] !== null && typeof state[key] !== "string") throw new Error("Invalid snapshot metadata");
    }
    return { ...state, dir: empty.dir, pinned: empty.pinned };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      empty.lastError = "Invalid snapshot metadata; refresh this source to rebuild its cache";
    }
    return empty;
  }
}

function privateDir(dir: string): void {
  fs.mkdirSync(dir, { mode: 0o700, recursive: true });
}

function writeState(target: string, state: SnapshotState): void {
  const tmp = target + "." + randomUUID();
  try {
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600, flag: "wx" });
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function inCooldown(state: SnapshotState): boolean {
  return state.cooldownUntil !== null && Date.parse(state.cooldownUntil) > Date.now();
}

function warning(source: LoadedSource, message: string, id?: string): void {
  source.issues.push({ severity: "warning", code: "source.document", message, path: id ?? `@${source.name}` });
}

function readList(source: LoadedSource, data: Record<string, unknown>, group: string, field: string,
  id: string, normalize: (value: string) => string): string[] {
  const obj = data[group];
  if (obj === undefined) return [];
  const values = obj && typeof obj === "object" ? (obj as Record<string, unknown>)[field] : null;
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    warning(source, `Expected a list for ${group}.${field}.`, id);
    return [];
  }
  const result = new Set<string>();
  for (const value of values) {
    try {
      if (typeof value !== "string") throw new Error("Expected a string");
      result.add(normalize(value));
    } catch (error) {
      warning(source, `Invalid ${group}.${field} entry: ${sanitizeErrorMessage(error)}`, id);
    }
  }
  return [...result];
}

function scanDocument(source: LoadedSource, absolutePath: string, sourceRelativePath: string, mountRepoPath: string | null): ParsedDocument | null {
  const id = parseSourceDocId(`@${source.name}/${sourceRelativePath}`).canonicalId;
  if (fs.statSync(absolutePath).size > MAX_SOURCE_DOCUMENT_BYTES) {
    warning(source, `Document exceeds the ${MAX_SOURCE_DOCUMENT_BYTES}-byte limit.`, id);
    return null;
  }
  const raw = fs.readFileSync(absolutePath, "utf8");
  const { hasFrontmatter, data, content } = parseYamlFrontmatter(raw);
  if (!hasFrontmatter || typeof data.description !== "string" || !data.description.trim()) return null;
  const kind = data.kind;
  const frontmatter: DocumentFrontmatter = { description: data.description.trim(), kind: "reference" };
  if (kind === "architecture" || kind === "guide" || kind === "reference") frontmatter.kind = kind;
  else if (kind !== undefined) warning(source, "Unknown document kind; using reference.", id);
  const paths = readList(source, data, "code", "paths", id, normalizeRepoRelativePath);
  if (paths.length) frontmatter.code = { paths };
  const requires = readList(source, data, "relations", "requires", id, (value) => {
    const target = parseSourceDocId(value.trim().startsWith("@") ? value : `@${source.name}/${value}`);
    if (target.alias !== source.name) throw new Error("Cross-source requirements are ignored");
    return target.canonicalId;
  });
  if (requires.length) frontmatter.relations = { requires };
  return {
    absolutePath, repoPath: id, llmdocPath: id, topic: `@${source.name}`, basename: path.basename(absolutePath),
    frontmatter, raw, body: content.trim(), title: extractTitle(content), links: extractLinks(content),
    codeRefs: extractCodeRefs(content), estimatedTokens: estimateTokens(content), lineCount: raw.split(/\r?\n/u).length,
    sourceName: source.name, sourceRelativePath, sourceMountPath: mountRepoPath
  };
}

// Follow neither a symlink selected by dir nor a symlink named llmdoc.
function documentRoot(mount: string, subdir: string | null): string {
  let effective = mount;
  if (subdir) {
    effective = resolveInsideRoot(mount, subdir);
    if (effective !== path.join(fs.realpathSync(mount), subdir)) throw new Error("Source dir traverses a symbolic link");
  }
  if (!fs.statSync(effective).isDirectory()) throw new Error("Source dir is not a directory");
  const nested = path.join(effective, "llmdoc");
  return fs.lstatSync(nested, { throwIfNoEntry: false })?.isDirectory() ? nested : effective;
}

function scan(source: LoadedSource, mount: string, mountRepoPath: string | null): void {
  source.mountDir = mount;
  const root = documentRoot(mount, source.dir);
  source.docRootDir = root;
  const skipped = new Set([".git", ".llmdoc-tmp", "node_modules"]);
  const seenIds = new Set<string>();
  function visit(dir: string): boolean {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (skipped.has(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!visit(file)) return false;
      } else if (entry.isFile() && /\.mdx?$/u.test(entry.name)) {
        try {
          const doc = scanDocument(source, file, toPosixRelative(root, file), mountRepoPath);
          if (!doc) continue;
          if (seenIds.has(doc.llmdocPath)) {
            warning(source, `Duplicate normalized source document ID skipped: ${doc.llmdocPath}`, doc.llmdocPath);
            continue;
          }
          if (source.documents.length === MAX_SOURCE_DOCUMENTS) {
            warning(source, `Source exceeds the ${MAX_SOURCE_DOCUMENTS}-document limit. Remaining documents were skipped.`);
            return false;
          }
          seenIds.add(doc.llmdocPath);
          source.documents.push(doc);
        } catch (error) {
          warning(source, sanitizeErrorMessage(error), `@${source.name}/${toPosixRelative(root, file)}`);
        }
      }
    }
    return true;
  }
  visit(root);
  source.status = "ready";
}

function loadSource(root: string, name: string, config: SourceConfig): LoadedSource {
  const source: LoadedSource = {
    name, kind: "git" in config ? "git" : "path", target: "git" in config ? "[invalid Git URL]" : config.path,
    ref: "git" in config ? config.ref ?? null : null, dir: null, status: "missing", revision: null, pinned: false,
    mountDir: null, docRootDir: null, isSubmodule: false, lastSyncedAt: null, lastAttemptAt: null,
    stale: false, error: null, remedy: null, documents: [], issues: []
  };
  try {
    if (!isValidSourceAlias(name)) throw new Error("Invalid source alias");
    if (config.dir !== undefined) source.dir = normalizeSourceSubdir(config.dir);
    if ("path" in config) {
      let mount: string;
      let mountRepoPath: string | null;
      if (config.allowOutsideRoot) {
        source.configuredPath = config.path;
        mount = path.resolve(root, config.path);
        const rootReal = fs.realpathSync(root);
        if (fs.existsSync(mount)) {
          const mountReal = fs.realpathSync(mount);
          mountRepoPath = isWithinRoot(rootReal, mountReal) ? toPosixRelative(rootReal, mountReal) : null;
        } else {
          mountRepoPath = null;
        }
      } else {
        source.configuredPath = normalizeRepoRelativePath(config.path);
        mount = resolveInsideRoot(root, source.configuredPath, { allowMissing: true });
        mountRepoPath = source.configuredPath;
      }

      if (!fs.existsSync(mount) || (fs.statSync(mount).isDirectory() && !fs.readdirSync(mount).length)) {
        if (!config.allowOutsideRoot) {
          const modules = path.join(root, ".gitmodules");
          if (fs.lstatSync(modules, { throwIfNoEntry: false })?.isFile()) {
            try {
              const listing = git(["config", "--null", "--no-includes", "--file", modules, "--list"], root, Infinity);
              source.isSubmodule = listing.split("\0").some(entry =>
                /^submodule\..+\.path\n/u.test(entry) && entry.slice(entry.indexOf("\n") + 1) === source.configuredPath);
            } catch {
              source.isSubmodule = false;
            }
          }
          source.remedy = "Run `git submodule update --init` or verify the configured path.";
        } else {
          source.remedy = `Verify the local path in llmdoc.config.local.json: ${config.path}`;
        }
        return source;
      }

      if (!fs.statSync(mount).isDirectory()) {
        throw new Error(`Configured path is not a directory: ${config.path}`);
      }

      source.isSubmodule = !config.allowOutsideRoot && fs.existsSync(path.join(mount, ".git"));
      if (fs.existsSync(path.join(mount, ".git"))) {
        try { source.revision = git(["-C", mount, "rev-parse", "--verify", "HEAD"], mount, Infinity); }
        catch { /* A repository with an unborn branch still has a readable tree. */ }
      }
      scan(source, mount, mountRepoPath);
    } else {
      const url = validateGitSourceUrl(config.git);
      if (!url.ok) throw new Error(url.message);
      source.target = source.gitUrl = url.normalized;
      source.refreshIntervalMs = parseRefreshDurationMs(config.refresh);
      const state = readState(config);
      source.pinned = state.pinned;
      source.error = state.lastError;
      source.lastSyncedAt = state.lastSyncedAt;
      source.lastAttemptAt = state.lastAttemptAt;
      const snapshot = state.currentSnapshot && path.join(cachePaths(config).snapshots, state.currentSnapshot);
      if (!snapshot || !fs.lstatSync(snapshot, { throwIfNoEntry: false })?.isDirectory()) {
        if (state.lastError) {
          source.status = "error";
          source.remedy = "Verify the git URL, ref, credentials, and network access, then retry `npx -y @tokenroll/llmdoc status --refresh`.";
        } else {
          source.status = "missing";
          source.remedy = "read this source or run `npx -y @tokenroll/llmdoc status --refresh` to fetch its snapshot.";
        }
        return source;
      }
      source.revision = state.revision;
      source.stale = !state.pinned && (!state.lastSyncedAt || Date.now() - Date.parse(state.lastSyncedAt) >= source.refreshIntervalMs);
      scan(source, snapshot, null);
      if (source.error) source.remedy = "Verify Git access and retry `npx -y @tokenroll/llmdoc status --refresh`.";
    }
  } catch (error) {
    source.status = "error";
    source.documents = [];
    source.error = sanitizeErrorMessage(error);
    source.remedy = "Verify the source configuration and that its directory is readable.";
  }
  return source;
}

type SourceIndex = Pick<WorkspaceData, "sources" | "sourcesByName" | "sourceDocuments" | "sourceDocumentsById">;

function indexSources(sources: LoadedSource[]): SourceIndex {
  const sourceDocuments = sources.flatMap(source => source.documents);
  return {
    sources,
    sourcesByName: new Map(sources.map(s => [s.name, s])),
    sourceDocuments,
    sourceDocumentsById: new Map(sourceDocuments.map(doc => [doc.llmdocPath, doc]))
  };
}

export function loadSourcesReadOnly(rootDir: string, sourcesConfig: Record<string, SourceConfig>): SourceIndex {
  return indexSources(Object.entries(sourcesConfig).map(([name, config]) => loadSource(rootDir, name, config)));
}

export function toSourceSummary(source: LoadedSource) {
  const { name, kind, target, ref, dir, status, revision, pinned, isSubmodule, lastSyncedAt, stale, error, remedy } = source;
  return {
    name, kind, target, ref, dir, status, documentCount: source.documents.length, revision, pinned,
    isSubmodule, lastSyncedAt, stale, error, remedy
  };
}

export function sourceDocumentMatchesPath(document: ParsedDocument, repoRelativePath: string): boolean {
  if (!document.sourceName) return false;
  let candidate = repoRelativePath;
  if (document.sourceMountPath) {
    const prefix = document.sourceMountPath + "/";
    if (!candidate.startsWith(prefix)) return false;
    candidate = candidate.slice(prefix.length);
  }
  return (document.frontmatter.code?.paths ?? []).some(pattern => matchesCodePathPattern(pattern, candidate));
}

function sleepMs(duration: number): void {
  if (duration > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, duration);
  }
}

function lockFile(file: string, waitUntilMs = 0): (() => void) | null {
  for (;;) {
    let fd: number;
    try {
      fd = fs.openSync(file, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = fs.statSync(file, { throwIfNoEntry: false });
      if (!stat) continue;
      let stale = Date.now() - stat.mtimeMs > DEFAULT_SOURCE_LOCK_STALE_MS;
      try {
        const owner = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try { process.kill(owner.pid, 0); }
          catch (err) { if ((err as NodeJS.ErrnoException).code === "ESRCH") stale = true; }
        }
        if (Date.now() - Date.parse(owner.createdAt) > DEFAULT_SOURCE_LOCK_STALE_MS) stale = true;
      } catch { /* An owner may still be writing its metadata. */ }
      if (stale) {
        if (fs.statSync(file, { throwIfNoEntry: false })?.ino === stat.ino) fs.rmSync(file, { force: true });
        continue;
      }
      const remaining = waitUntilMs - Date.now();
      if (remaining > 0) {
        sleepMs(Math.min(100, remaining));
        continue;
      }
      return null;
    }
    const own = fs.fstatSync(fd);
    const release = () => {
      if (fs.statSync(file, { throwIfNoEntry: false })?.ino === own.ino) fs.rmSync(file, { force: true });
      fs.closeSync(fd);
    };
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }
}

function fetchRevision(config: GitSourceConfig, mirror: string, deadline: number): string {
  const refCheck = validateGitRef(config.ref ?? "HEAD");
  if (!refCheck.ok) {
    throw new Error(refCheck.message);
  }
  const ref = refCheck.normalized;
  for (let attempt = 0; ; attempt++) {
    try {
      git(["fetch", "--quiet", "--no-recurse-submodules", "--no-tags", "--", config.git, ref], mirror, deadline);
      break;
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      const permanent = /permission denied|authentication failed|host key verification failed|could not read username|not found|not a git repository|repository .* does not exist|returned error: (401|403|404)|couldn't find remote ref/iu;
      const transient = /ETIMEDOUT|timed out|could not resolve host|connection reset|failed to connect|unable to access/iu;
      const delay = 100 * 2 ** attempt;
      if (attempt >= DEFAULT_SOURCE_MAX_RETRIES || permanent.test(message) || !transient.test(message) ||
          Date.now() + delay >= deadline) throw error;
      sleepMs(delay);
    }
  }
  const revision = git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"], mirror, deadline);
  if (!isCommitSha(revision)) throw new Error("Git returned an invalid commit ID");
  return revision;
}

function protectFiles(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) protectFiles(file);
    if (entry.isFile()) fs.chmodSync(file, fs.statSync(file).mode & 0o555);
  }
}

function hasGitTree(mirror: string, revision: string, treePath: string, deadline: number): boolean {
  const output = git(["ls-tree", "-d", "--name-only", revision, "--", treePath], mirror, deadline);
  return output.split(/\r?\n/u).some((line) => line.trim() === treePath);
}

function exportSnapshot(mirror: string, snapshots: string, revision: string, dir: string | null, deadline: number): string {
  privateDir(snapshots);
  const tmp = fs.mkdtempSync(path.join(snapshots, ".tmp-"));
  try {
    // Export only the minimal documentation subtree when `dir` or `llmdoc/` exists,
    // avoiding checking out tens of thousands of unrelated source files from large repos.
    let checkoutPath: string | null = null;
    if (dir) {
      const nestedLlmdoc = `${dir}/llmdoc`;
      if (hasGitTree(mirror, revision, nestedLlmdoc, deadline)) {
        checkoutPath = nestedLlmdoc;
      } else if (hasGitTree(mirror, revision, dir, deadline)) {
        checkoutPath = dir;
      } else {
        throw new Error(`Configured dir "${dir}" does not exist in revision ${revision.slice(0, 7)}`);
      }
    } else if (hasGitTree(mirror, revision, "llmdoc", deadline)) {
      checkoutPath = "llmdoc";
    } else {
      const tree = git(["ls-tree", "--name-only", revision], mirror, deadline);
      checkoutPath = tree ? "." : null;
    }

    if (checkoutPath) {
      git([`--git-dir=${mirror}`, `--work-tree=${tmp}`, "checkout", "--force", "--no-overlay", revision, "--", checkoutPath], tmp, deadline);
    }
    documentRoot(tmp, dir);
    protectFiles(tmp);
    const generation = randomUUID();
    fs.renameSync(tmp, path.join(snapshots, generation));
    return generation;
  } finally {
    fs.rmSync(tmp, { force: true, recursive: true });
  }
}

type SyncOutcome = "refreshed" | "unchanged" | "skipped" | { error: string };

function syncSource(config: GitSourceConfig, mode: "cold" | "due" | "force", deadline: number): SyncOutcome {
  const { cache, mirror, dir, statePath, snapshots } = cachePaths(config);
  privateDir(cache);
  privateDir(path.dirname(mirror));
  const waitUntil = mode === "due" ? 0 : Math.min(deadline, Date.now() + 2_500);
  const release = lockFile(path.join(cache, ".lock"), waitUntil);
  if (!release) {
    return mode === "force"
      ? { error: "Another process is currently syncing this source cache; retry shortly" }
      : "skipped";
  }
  try {
    const state = readState(config);
    const previous = state.currentSnapshot;
    const ready = !!previous && !!fs.lstatSync(path.join(snapshots, previous), { throwIfNoEntry: false })?.isDirectory();
    if (mode !== "force" && inCooldown(state)) return "skipped";
    if (mode === "cold" && ready) return "skipped";
    if (mode === "due" && (!ready || state.pinned || (state.lastSyncedAt &&
        Date.now() - Date.parse(state.lastSyncedAt) < parseRefreshDurationMs(config.refresh)))) return "skipped";

    // FETCH_HEAD and the checkout index are shared by every ref of this URL.
    const releaseMirror = lockFile(mirror + ".lock", waitUntil);
    if (!releaseMirror) {
      return mode === "force"
        ? { error: "Another process is currently updating this Git mirror; retry shortly" }
        : "skipped";
    }
    let generation: string | null = null;
    try {
      state.lastAttemptAt = new Date().toISOString();
      if (!fs.existsSync(path.join(mirror, "HEAD"))) {
        privateDir(mirror);
        git(["init", "--bare", "--quiet", mirror], cache, deadline);
      }
      const revision = fetchRevision(config, mirror, deadline);
      if (state.revision && state.revision !== revision) {
        try { git(["merge-base", "--is-ancestor", state.revision, revision], mirror, deadline); }
        catch (error) {
          throw new Error(`Cannot verify a fast-forward update; keeping the previous snapshot (${sanitizeErrorMessage(error)})`);
        }
      }
      if (!ready || revision !== state.revision) {
        generation = exportSnapshot(mirror, snapshots, revision, dir, deadline);
      }
      // Keep each published revision reachable even after fetching another ref.
      git(["update-ref", "refs/llmdoc/" + path.basename(cache), revision], mirror, deadline);
      writeState(statePath, {
        ...state,
        currentSnapshot: generation ?? previous,
        revision,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        cooldownUntil: null
      });
    } catch (error) {
      if (generation) fs.rmSync(path.join(snapshots, generation), { force: true, recursive: true });
      const message = sanitizeErrorMessage(error);
      writeState(statePath, {
        ...state,
        lastError: message,
        cooldownUntil: new Date(Date.now() + envMs("LLMDOC_COOLDOWN_MS", DEFAULT_SOURCE_COOLDOWN_MS)).toISOString()
      });
      return { error: message };
    } finally {
      releaseMirror();
    }
    if (generation) {
      for (const entry of fs.readdirSync(snapshots, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== generation && entry.name !== previous) {
          fs.rmSync(path.join(snapshots, entry.name), { recursive: true, force: true });
        }
      }
    }
    return generation ? "refreshed" : "unchanged";
  } finally {
    release();
  }
}

function runSync(workspace: WorkspaceData, mode: "cold" | "due" | "force", aliases?: readonly string[]) {
  const results = new Map<string, SyncOutcome>();
  const outcomes = new Map<string, SyncOutcome>();
  const configs = workspace.llmdocConfig.sources;
  const deadline = Date.now() + envMs("LLMDOC_COLD_WALL_TIMEOUT_MS", DEFAULT_SOURCE_COLD_WALL_TIMEOUT_MS);
  for (const source of workspace.sources) {
    if (source.kind !== "git" || !source.gitUrl || (aliases && !aliases.includes(source.name))) continue;
    if (mode === "cold" && source.status === "ready") continue;
    if (mode === "due" && (source.status !== "ready" || !source.stale)) continue;
    const config = configs[source.name];
    if (!config || !("git" in config)) continue;
    const key = cachePaths(config).cache;
    let outcome = outcomes.get(key);
    if (outcome === undefined) {
      if (Date.now() >= deadline) {
        outcome = { error: "Source sync exceeded the command time limit" };
      } else {
        try { outcome = syncSource(config, mode, deadline); }
        catch (error) { outcome = { error: sanitizeErrorMessage(error) }; }
      }
      outcomes.set(key, outcome);
    }
    results.set(source.name, outcome);
  }
  if (outcomes.size) {
    const updated = workspace.sources.map(source => {
      const config = configs[source.name];
      if (!config || !("git" in config)) return source;
      const key = cachePaths(config).cache;
      if (!outcomes.has(key)) return source;
      const reloaded = loadSource(workspace.rootDir, source.name, config);
      const outcome = outcomes.get(key);
      if (outcome && typeof outcome === "object" && !reloaded.error) {
        reloaded.error = outcome.error;
      }
      return reloaded;
    });
    Object.assign(workspace, indexSources(updated));
  }
  return results;
}

export function ensureSourcesForRead(workspace: WorkspaceData, targetAliases?: readonly string[]) {
  const fetched: string[] = [];
  const warnings: string[] = [];
  const results = runSync(workspace, "cold", targetAliases);
  for (const [name, outcome] of results) {
    if (outcome === "skipped") continue;
    fetched.push(name);
    if (typeof outcome === "object") warnings.push(`@${name}: ${outcome.error}`);
    for (const issue of workspace.sourcesByName.get(name)?.issues ?? []) warnings.push(`${issue.path}: ${issue.message}`);
  }
  return { fetched, warnings };
}

export function refreshGitSources(workspace: WorkspaceData, options?: { force?: boolean; aliases?: readonly string[] }) {
  const refreshed: string[] = [];
  const unchanged: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const [name, outcome] of runSync(workspace, options?.force ? "force" : "due", options?.aliases)) {
    if (outcome === "refreshed") refreshed.push(name);
    if (outcome === "unchanged") unchanged.push(name);
    if (typeof outcome === "object") failed.push({ name, error: outcome.error });
  }
  return { refreshed, unchanged, failed };
}

export function triggerBackgroundRefreshIfNeeded(workspace: WorkspaceData): boolean {
  if (process.env.LLMDOC_DISABLE_BG_REFRESH === "1") return false;
  const due = workspace.sources.some(source => {
    if (source.kind !== "git" || source.status !== "ready" || !source.stale) return false;
    const config = workspace.llmdocConfig.sources[source.name];
    if (!config || !("git" in config)) return false;
    const { cache } = cachePaths(config);
    return !inCooldown(readState(config)) && !fs.existsSync(path.join(cache, ".lock"));
  });
  if (!due) return false;
  const entry = path.join(packageRootFromImport(import.meta.url), "dist", "bin", "llmdoc.js");
  if (!fs.existsSync(entry)) return false;
  try {
    const child = spawn(process.execPath, [entry, "_refresh-sources", "--cwd", workspace.rootDir], {
      detached: true, stdio: "ignore"
    });
    child.on("error", () => { /* Background refresh is best effort. */ });
    child.unref();
    return child.pid !== undefined;
  } catch {
    return false;
  }
}
