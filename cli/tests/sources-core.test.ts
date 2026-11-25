import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SourceConfig, WorkspaceData } from "../src/types.js";
import { MAX_SOURCE_DOCUMENT_BYTES, MAX_SOURCE_DOCUMENTS } from "../src/lib/constants.js";
import { CliError } from "../src/lib/errors.js";
import { parseYamlFrontmatter } from "../src/lib/frontmatter.js";
import {
  formatDocumentPath, isSourceRef, isValidSourceAlias, matchesDocumentTopic,
  normalizeSourceSubdir, parseSourceDocId, parseSourceTopicFilter
} from "../src/lib/source-id.js";
import {
  ensureSourcesForRead, getLlmdocHomeDir, isCommitSha, loadSourcesReadOnly, parseRefreshDurationMs,
  refreshGitSources, sourceDocumentMatchesPath, toSourceSummary, triggerBackgroundRefreshIfNeeded, validateGitSourceUrl
} from "../src/lib/sources.js";

vi.mock("node:child_process", async (load) => {
  const original = await load<typeof import("node:child_process")>();
  return { ...original, spawnSync: vi.fn(original.spawnSync), spawn: vi.fn(original.spawn) };
});

let tmp: string;
let root: string;
let home: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-sources-"));
  root = path.join(tmp, "consumer");
  home = path.join(tmp, "cache");
  fs.mkdirSync(root);
  vi.stubEnv("LLMDOC_HOME", home);
  vi.stubEnv("LLMDOC_DISABLE_BG_REFRESH", "1");
  vi.stubEnv("GIT_CONFIG_GLOBAL", os.devNull);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_ALLOW_PROTOCOL", "file");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function put(base: string, name: string, content: string): void {
  const target = path.join(base, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function doc(description: string, extra = ""): string {
  return `---\ndescription: ${description}\n${extra}---\n# ${description}\n`;
}

function workspace(sources: Record<string, SourceConfig>): WorkspaceData {
  return {
    rootDir: root, llmdocDir: path.join(root, "llmdoc"), metaPath: path.join(root, "llmdoc/meta.json"), meta: null,
    documents: [], documentsByLlmdocPath: new Map(), topics: new Map(), rootSingletons: [], preloadIssues: [],
    llmdocConfig: { exists: true, config: { schema: "llmdoc.config/v2", sources }, schemaVersion: 2,
      preloadPaths: [], preloadEntries: [], sources, issues: [], hasLocalPreloadErrors: false },
    ...loadSourcesReadOnly(root, sources)
  };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function remote() {
  const work = path.join(tmp, "work");
  const bare = path.join(tmp, "upstream.git");
  git(tmp, "init", "-q", "-b", "main", work);
  put(work, "a/llmdoc/api.md", doc("Initial", "code:\n  paths: ['**/Dockerfile']\n"));
  put(work, "b/nested/schema.mdx", doc("Schema"));
  git(work, "add", ".");
  git(work, "commit", "-qm", "first");
  const initial = git(work, "rev-parse", "HEAD");
  git(work, "branch", "stable");
  git(tmp, "clone", "--bare", work, bare);
  return { work, bare, initial, url: pathToFileURL(bare).href };
}

function cacheDir(url: string, ref: string | null = null, dir: string | null = null): string {
  return path.join(home, "sources", "v1", createHash("sha256").update(JSON.stringify([url, ref, dir])).digest("hex").slice(0, 24));
}

describe("source IDs", () => {
  it("keeps alias, path, and topic boundaries distinct", () => {
    expect(isValidSourceAlias("a".repeat(64))).toBe(true);
    expect(isValidSourceAlias("a".repeat(65))).toBe(false);
    expect(isSourceRef("  @team/x.md")).toBe(true);
    expect(parseSourceDocId("@team\\nested\\retry.mdx")).toEqual({
      alias: "team", relativePath: "nested/retry.mdx", canonicalId: "@team/nested/retry.mdx"
    });
    const mounted = { topic: "nested", sourceName: "team", llmdocPath: "@team/nested/retry.mdx", sourceRelativePath: "nested/retry.mdx" };
    expect(formatDocumentPath(mounted)).toBe(mounted.llmdocPath);
    expect(formatDocumentPath({ llmdocPath: "nested/retry.mdx" })).toBe("llmdoc/nested/retry.mdx");
    expect(["@team", "@team/nested/", "@team/nest", "@another", "nested"].map(f => matchesDocumentTopic(mounted, f)))
      .toEqual([true, true, false, false, false]);
    expect(matchesDocumentTopic({ topic: "nested", llmdocPath: "nested/retry.mdx" }, "nested")).toBe(true);
    expect(parseSourceTopicFilter("@a")).toEqual({ alias: "a", subdir: null });
    expect(parseSourceTopicFilter("@a/x/y/")).toEqual({ alias: "a", subdir: "x/y" });
    expect(normalizeSourceSubdir("contracts\\api/")).toBe("contracts/api");
  });
  it.each(["@UP/doc.md", "@.a/doc.md", "team/x.md", "@a/../bad.md", "@a//bad.md", "@a/c:/bad.md",
    "@a/./bad.md", "@a/dir/\0x.md", "@a/test.js", "@a"])("rejects invalid document ID %s", input => {
    expect(() => parseSourceDocId(input)).toThrow(CliError);
  });
  it.each(["@x/a/../b", "@a//abs", "@a/x//", "@a/c:/abs", "@a/topic*/"])("rejects invalid topic %s", input => {
    expect(() => parseSourceTopicFilter(input)).toThrow(CliError);
  });
});

describe("plain YAML front matter", () => {
  it("preserves the body and handles BOM, CRLF and empty mappings", () => {
    expect(parseYamlFrontmatter("\uFEFF---\r\na: [yes, 2]\r\n---\r\n# body\r\n"))
      .toEqual({ hasFrontmatter: true, data: { a: ["yes", 2] }, content: "# body\r\n" });
    for (const header of ["---\n---", "---\nnull\n---", "---\n{}\n---"]) {
      expect(parseYamlFrontmatter(header)).toEqual({ hasFrontmatter: true, data: {}, content: "" });
    }
    for (const raw of ["---\nunterminated", "text\n---\na: b\n---", "--- \n---\n"]) {
      expect(parseYamlFrontmatter(raw)).toEqual({ hasFrontmatter: false, data: {}, content: raw });
    }
    for (const value of ["42", "false", "[]", "!!js/function 'function () {}'"]) {
      expect(() => parseYamlFrontmatter(`---\n${value}\n---`)).toThrow();
    }
  });
  it.each(["js", "javascript", "coffee", "json"])("rejects %s without invoking the embedded expression", engine => {
    const marker = vi.fn();
    vi.stubGlobal("frontmatterMarker", marker);
    try {
      expect(() => parseYamlFrontmatter(`\uFEFF---${engine}\nglobalThis.frontmatterMarker()\n---\n`)).toThrow(/only plain YAML/);
      expect(marker).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe("local sources", () => {
  it("scans both layouts, bounds symlinks and reports individual invalid documents", () => {
    const mount = path.join(root, "vendor/team");
    put(mount, "packs/llmdoc/contracts/a.md", doc("A", "kind: guide\ncode:\n  paths: ['./src/**', '../outside']\nrelations:\n  requires: [nested/b.mdx, '@foreign/no.md', '@team/also.md']\n"));
    put(mount, "packs/llmdoc/nested/b.mdx", doc("B", "kind: other\n"));
    put(mount, "packs/llmdoc/plain.md", "plain");
    put(mount, "packs/llmdoc/no-desc.md", "---\ntitle: Hello\n---\n");
    put(mount, "packs/llmdoc/bad.md", "---\nbroken: [\n---\n");
    put(mount, "packs/llmdoc/tag.md", "---js\n1\n---\n");
    put(mount, "packs/ignored.md", doc("Outside llmdoc"));
    for (const folder of [".git", ".llmdoc-tmp", "node_modules"]) put(mount, `packs/llmdoc/${folder}/ignore.md`, doc("Skip"));
    put(root, "other/deep/x.md", doc("Loose"));
    fs.symlinkSync(path.join(root, "other"), path.join(mount, "packs/llmdoc/link"));
    fs.mkdirSync(path.join(root, "empty"));
    put(root, ".gitmodules", '[submodule "empty"]\n  path = empty\n');
    fs.symlinkSync(tmp, path.join(root, "outside"));
    const w = workspace({ team: { path: "vendor/team", dir: "packs" }, loose: { path: "other" },
      absent: { path: "absent" }, empty: { path: "empty" }, escape: { path: "../bad" },
      symlink: { path: "outside" }, dirlink: { path: "vendor/team", dir: "packs/llmdoc/link" } });
    expect(w.sourceDocuments.map(d => d.llmdocPath)).toEqual(["@team/contracts/a.md", "@team/nested/b.mdx", "@loose/deep/x.md"]);
    const a = w.sourceDocuments[0];
    expect(a.frontmatter).toEqual({ description: "A", kind: "guide", code: { paths: ["src/**"] },
      relations: { requires: ["@team/nested/b.mdx", "@team/also.md"] } });
    expect(w.sourceDocuments[1].frontmatter.kind).toBe("reference");
    expect(w.sourcesByName.get("team")?.issues).toHaveLength(5);
    expect(sourceDocumentMatchesPath(a, "vendor/team/src/retry.ts")).toBe(true);
    for (const file of ["src/retry.ts", "vendor/teams/src/retry.ts"]) expect(sourceDocumentMatchesPath(a, file)).toBe(false);
    expect(w.sourcesByName.get("empty")).toMatchObject({ status: "missing", isSubmodule: true, remedy: expect.stringContaining("submodule update") });
    expect(w.sourcesByName.get("absent")?.status).toBe("missing");
    for (const key of ["escape", "symlink", "dirlink"]) expect(w.sourcesByName.get(key)?.status).toBe("error");
    expect(fs.existsSync(home)).toBe(false);
  });

  it("caps document count and skips oversized files with warnings", () => {
    put(root, "pack/000.md", "x".repeat(MAX_SOURCE_DOCUMENT_BYTES + 1));
    for (let i = 0; i <= MAX_SOURCE_DOCUMENTS; i++) put(root, `pack/doc-${i}.md`, doc("valid"));
    const [source] = workspace({ limited: { path: "pack" } }).sources;
    expect(source.documents).toHaveLength(MAX_SOURCE_DOCUMENTS);
    expect(source.issues.map(i => i.message)).toEqual([expect.stringContaining("byte limit"), expect.stringContaining("document limit")]);
  });
});

describe("Git sources", () => {
  it("validates transport, full commit IDs and refresh intervals", () => {
    for (const url of ["ssh://git@Alias/team", "git@Alias:team/docs", "http://example.invalid/repo",
      "https://example.invalid/x", "file:///tmp/repo"]) expect(validateGitSourceUrl(url)).toEqual({ ok: true, normalized: url });
    for (const url of ["ext::bad", "-flag", "/tmp/test", "https://u:secret@host/repo", "ftp://host/repo",
      "https://host/r\n", "file:///a b"]) expect(validateGitSourceUrl(url).ok).toBe(false);
    expect(getLlmdocHomeDir()).toBe(home);
    expect(isCommitSha("a".repeat(40))).toBe(true);
    expect(isCommitSha("abcdef0")).toBe(false);
    expect([undefined, "1m", "2h", "1d"].map(parseRefreshDurationMs)).toEqual([86400000, 60000, 7200000, 86400000]);
    for (const value of ["0h", "1s", " 1d", "1.5h", "-1h"]) expect(() => parseRefreshDurationMs(value)).toThrow();
  });

  it("cold-fetches targeted aliases, shares a mirror across refs, and preserves offline snapshots", () => {
    const { work, bare, initial, url } = remote();
    const configs = { api: { git: url, dir: "a" }, schema: { git: url, dir: "b" },
      stable: { git: url, ref: "stable", dir: "a" }, pin: { git: url, ref: initial, dir: "a" } };
    const w = workspace(configs);
    expect(w.sources.every(s => s.status === "missing")).toBe(true);
    expect(fs.existsSync(home)).toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
    expect(triggerBackgroundRefreshIfNeeded(w)).toBe(false);
    expect(ensureSourcesForRead(w, ["api"])).toEqual({ fetched: ["api"], warnings: [] });
    expect(w.sourceDocumentsById.has("@api/api.md")).toBe(true);
    expect(w.sourcesByName.get("schema")?.status).toBe("missing");
    expect(w.sourcesByName.get("stable")?.status).toBe("missing");
    expect(ensureSourcesForRead(w).fetched).toEqual(["schema", "stable", "pin"]);
    expect(fs.readdirSync(path.join(home, "mirrors/v1"))).toHaveLength(1);
    expect(fs.readdirSync(path.join(home, "sources/v1"))).toHaveLength(4);
    expect(toSourceSummary(w.sourcesByName.get("pin")!)).toMatchObject({ target: url, status: "ready", pinned: true,
      revision: initial, documentCount: 1, ref: initial, dir: "a", stale: false });
    const old = w.sourceDocumentsById.get("@api/api.md")!;
    expect(sourceDocumentMatchesPath(old, "services/x/Dockerfile")).toBe(true);
    expect(sourceDocumentMatchesPath(old, "Dockerfile")).toBe(true);
    expect(fs.existsSync(path.join(w.sources[0].mountDir!, ".git"))).toBe(false);
    expect(fs.statSync(old.absolutePath).mode & 0o222).toBe(0);
    const push = () => {
      git(work, "add", ".");
      git(work, "commit", "-qm", "update");
      git(work, "push", "-q", "--force", bare, "main");
      return git(work, "rev-parse", "HEAD");
    };
    put(work, "a/llmdoc/api.md", doc("Updated"));
    const updated = push();
    expect(refreshGitSources(w).refreshed).toEqual([]);
    expect(refreshGitSources(w, { aliases: ["api"], force: true })).toEqual({ refreshed: ["api"], unchanged: [], failed: [] });
    expect(w.sourceDocumentsById.get("@api/api.md")?.title).toBe("Updated");
    expect(w.sourcesByName.get("schema")?.revision).toBe(initial);
    expect(w.sourcesByName.get("pin")?.revision).toBe(initial);
    expect(w.sourcesByName.get("stable")?.revision).toBe(initial);
    expect(fs.readFileSync(old.absolutePath, "utf8")).toContain("Initial");
    expect(refreshGitSources(w, { aliases: ["api"], force: true }).unchanged).toEqual(["api"]);
    git(work, "reset", "--hard", initial);
    put(work, "a/llmdoc/api.md", doc("Diverged"));
    push();
    expect(refreshGitSources(w, { aliases: ["api"], force: true }).failed).toEqual([{ name: "api", error: expect.stringMatching(/fast-forward/) }]);
    fs.renameSync(bare, bare + ".offline");
    const offline = workspace(configs);
    expect(offline.sourcesByName.get("api")).toMatchObject({ revision: updated, status: "ready" });
    expect(offline.sourceDocumentsById.get("@api/api.md")?.title).toBe("Updated");
    expect(ensureSourcesForRead(offline).fetched).toEqual([]);
  });

  it("cools down failures, supports a forced retry, and never stores credentials", () => {
    const url = pathToFileURL(path.join(tmp, "absent.git")).href;
    const config = { missing: { git: url }, invalid: { git: "https://u:secret@host/repo" } };
    const w = workspace(config);
    expect(w.sourcesByName.get("invalid")?.status).toBe("error");
    expect(JSON.stringify(toSourceSummary(w.sources[1]))).not.toContain("secret");
    expect(ensureSourcesForRead(w)).toEqual({ fetched: ["missing"], warnings: [expect.stringContaining("@missing")] });
    const calls = vi.mocked(spawnSync).mock.calls.length;
    expect(ensureSourcesForRead(workspace(config)).fetched).toEqual([]);
    expect(spawnSync).toHaveBeenCalledTimes(calls);
    expect(refreshGitSources(w, { force: true }).failed[0].name).toBe("missing");
    const state = JSON.parse(fs.readFileSync(path.join(cacheDir(url), "state.json"), "utf8"));
    expect(Date.parse(state.cooldownUntil)).toBeGreaterThan(Date.now());
    expect(state.currentSnapshot).toBeNull();
    expect(state.lastError).toBeTruthy();
  });

  it.each([
    { message: "Unable to access https://user:password@host/repo: Connection reset", attempts: 4 },
    { message: "Unable to access https://user:password@host/repo: Authentication failed", attempts: 1 }
  ])("retries only transient fetch failures ($attempts attempts)", ({ message, attempts }) => {
    const { url } = remote();
    const mirror = path.join(home, "mirrors/v1", createHash("sha256").update(url).digest("hex").slice(0, 24) + ".git");
    fs.mkdirSync(mirror, { recursive: true });
    git(mirror, "init", "--bare");
    const w = workspace({ team: { git: url } });
    vi.stubEnv("LLMDOC_GIT_TIMEOUT_MS", "150");
    vi.stubEnv("GIT_SSH_COMMAND", undefined);
    const calls = vi.mocked(spawnSync);
    for (let i = 0; i < attempts; i++) {
      calls.mockReturnValueOnce({ pid: 1, status: 128, signal: null, output: [],
        stdout: Buffer.alloc(0), stderr: Buffer.from(message) });
    }
    const result = ensureSourcesForRead(w);
    expect(calls).toHaveBeenCalledTimes(attempts);
    for (const [command, args, options] of calls.mock.calls) {
      expect(command).toBe("git");
      expect(args).toEqual(expect.arrayContaining(["fetch", "protocol.ext.allow=never", "core.hooksPath=/dev/null", "submodule.recurse=false"]));
      expect(options).toMatchObject({ timeout: 150, env: { GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: expect.stringContaining("BatchMode=yes") } });
    }
    expect(result.warnings[0]).toContain("[redacted]@host");
    expect(fs.readFileSync(path.join(cacheDir(url), "state.json"), "utf8")).not.toContain("password");
  });

  it("detects the mounted repository revision without inheriting the caller's Git directory", () => {
    const { work, initial } = remote();
    fs.renameSync(work, path.join(root, "submodule"));
    vi.stubEnv("GIT_DIR", path.join(tmp, "elsewhere.git"));
    expect(workspace({ docs: { path: "submodule" } }).sources[0])
      .toMatchObject({ isSubmodule: true, revision: initial, status: "ready" });
  });

  it("respects live locks, recovers abandoned ones, and launches only due background refreshes", () => {
    const { url } = remote();
    const configs = { team: { git: url, dir: "b", refresh: "1m" } };
    const w = workspace(configs);
    const cache = cacheDir(url, null, "b");
    vi.stubEnv("LLMDOC_COLD_WALL_TIMEOUT_MS", "200");
    put(cache, ".lock", JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    expect(ensureSourcesForRead(w).fetched).toEqual([]);
    expect(spawnSync).not.toHaveBeenCalled();
    vi.stubEnv("LLMDOC_COLD_WALL_TIMEOUT_MS", "15000");
    put(cache, ".lock", JSON.stringify({ pid: process.pid, createdAt: "2000-01-01T00:00:00Z" }));
    expect(ensureSourcesForRead(w).fetched).toEqual(["team"]);
    vi.stubEnv("LLMDOC_DISABLE_BG_REFRESH", "0");
    expect(triggerBackgroundRefreshIfNeeded(w)).toBe(false);
    const state = JSON.parse(fs.readFileSync(path.join(cache, "state.json"), "utf8"));
    state.lastSyncedAt = "2000-01-01T00:00:00Z";
    state.cooldownUntil = "2100-01-01T00:00:00Z";
    put(cache, "state.json", JSON.stringify(state));
    expect(triggerBackgroundRefreshIfNeeded(workspace(configs))).toBe(false);
    state.cooldownUntil = null;
    put(cache, "state.json", JSON.stringify(state));
    const due = workspace(configs);
    const unref = vi.fn();
    vi.mocked(spawn).mockReturnValueOnce({ pid: 123, on: vi.fn(), unref } as unknown as ReturnType<typeof spawn>);
    expect(triggerBackgroundRefreshIfNeeded(due)).toBe(true);
    expect(spawn).toHaveBeenCalledWith(process.execPath, [expect.stringMatching(/llmdoc\.js$/), "_refresh-sources", "--cwd", root],
      { detached: true, stdio: "ignore" });
    expect(unref).toHaveBeenCalledOnce();
    expect(refreshGitSources(due).unchanged).toEqual(["team"]);
    expect(due.sources[0].stale).toBe(false);
  });
});
