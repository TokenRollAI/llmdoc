import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../src/cli.js";
import { assertOutputSchema } from "../src/lib/output-schema.js";
import { commitAll, createFixture, detachHead, readMeta, removeGitDirectory, stageFile, writeRepoFile } from "./helpers.js";

describe("llmdoc cli", () => {
  test("validate passes on a valid v3 workspace", async () => {
    const rootDir = createFixture();
    const result = await runCli(["validate"], rootDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("validate: ok");
  });

  test("validate reports dangling links and ledger mismatch", async () => {
    const danglingRoot = createFixture({ broken: "dangling-link" });
    const danglingResult = await runCli(["validate"], danglingRoot);
    expect(danglingResult.exitCode).toBe(1);
    expect(danglingResult.stdout).toContain("link.missing");

    const mismatchRoot = createFixture({ broken: "meta-mismatch" });
    const mismatchResult = await runCli(["validate"], mismatchRoot);
    expect(mismatchResult.exitCode).toBe(1);
    expect(mismatchResult.stdout).toContain("meta.entry.missing");
  });

  test("validate reports invalid yaml/json, forbidden mdx syntax, stray files, and bad git revisions as issues", async () => {
    const invalidYamlRoot = createFixture({ broken: "invalid-yaml" });
    const invalidYamlResult = await runCli(["validate"], invalidYamlRoot);
    expect(invalidYamlResult.exitCode).toBe(1);
    expect(invalidYamlResult.stdout).toContain("frontmatter.parse");

    const invalidJsonRoot = createFixture({ broken: "invalid-meta-json" });
    const invalidJsonResult = await runCli(["validate"], invalidJsonRoot);
    expect(invalidJsonResult.exitCode).toBe(1);
    expect(invalidJsonResult.stdout).toContain("meta.parse");

    const forbiddenMdxRoot = createFixture({ broken: "forbidden-jsx" });
    const forbiddenMdxResult = await runCli(["validate"], forbiddenMdxRoot);
    expect(forbiddenMdxResult.exitCode).toBe(1);
    expect(forbiddenMdxResult.stdout).toContain("mdx.syntax.forbidden");

    const strayFileRoot = createFixture({ broken: "non-mdx-file" });
    const strayFileResult = await runCli(["validate"], strayFileRoot);
    expect(strayFileResult.exitCode).toBe(1);
    expect(strayFileResult.stdout).toContain("file.extension.invalid");

    const badRevisionRoot = createFixture({ broken: "invalid-revision" });
    const badRevisionResult = await runCli(["validate"], badRevisionRoot);
    expect(badRevisionResult.exitCode).toBe(1);
    expect(badRevisionResult.stdout).toContain("meta.baseline.revision.missing");
    expect(badRevisionResult.stdout).toContain("meta.document.revision.missing");

    const invalidTimestampRoot = createFixture({ broken: "invalid-timestamp" });
    const invalidTimestampResult = await runCli(["validate"], invalidTimestampRoot);
    expect(invalidTimestampResult.exitCode).toBe(1);
    expect(invalidTimestampResult.stdout).toContain("meta.invalid");
  });

  test("tree, index, show, search and context expose progressive disclosure surfaces", async () => {
    const rootDir = createFixture();

    const tree = await runCli(["tree"], rootDir);
    expect(tree.stdout).toContain("api-client/");
    expect(tree.stdout).toContain("architecture.mdx");

    const treePage1 = await runCli(["tree", "--limit", "1", "--json"], rootDir);
    const treePage1Json = JSON.parse(treePage1.stdout) as {
      rootSingletons: Array<{ path: string }>;
      topics: Array<{ topic: string }>;
      pagination: { totalItems: number; returnedItems: number; nextCursor: string | null };
    };
    expect(treePage1Json.rootSingletons.map((item) => item.path)).toEqual(["llmdoc/architecture.mdx"]);
    expect(treePage1Json.topics).toEqual([]);
    expect(treePage1Json.pagination.totalItems).toBe(2);
    expect(treePage1Json.pagination.returnedItems).toBe(1);
    expect(treePage1Json.pagination.nextCursor).not.toBeNull();

    const treePage2 = await runCli(["tree", "--limit", "1", "--cursor", treePage1Json.pagination.nextCursor!, "--json"], rootDir);
    const treePage2Json = JSON.parse(treePage2.stdout) as {
      rootSingletons: Array<{ path: string }>;
      topics: Array<{ topic: string }>;
      pagination: { totalItems: number; returnedItems: number; nextCursor: string | null };
    };
    expect(treePage2Json.rootSingletons).toEqual([]);
    expect(treePage2Json.topics.map((item) => item.topic)).toEqual(["api-client"]);
    expect(treePage2Json.pagination.totalItems).toBe(2);
    expect(treePage2Json.pagination.returnedItems).toBe(1);
    expect(treePage2Json.pagination.nextCursor).toBeNull();

    const index = await runCli(["index", "--topic", "api-client"], rootDir);
    expect(index.stdout).toContain("retry-policy.mdx");
    expect(index.stdout).toContain("code.paths");

    const show = await runCli(["show", "api-client/retry-policy.mdx"], rootDir);
    expect(show.stdout).toContain("请求重试策略");

    const search = await runCli(["search", "重试"], rootDir);
    expect(search.stdout).toContain("retry-policy.mdx");
    expect(fs.existsSync(path.join(rootDir, ".llmdoc-tmp", "cache", "search-index.json"))).toBe(true);

    const context = await runCli(["context", "--files", "src/api/retry.ts"], rootDir);
    expect(context.stdout).toContain("retry-policy.mdx");
    expect(context.stdout).toContain("requires -> llmdoc/api-client/error-model.mdx");
  });

  test("show rejects symlink escape paths", async () => {
    const rootDir = createFixture({ withSymlinkEscape: true });
    const result = await runCli(["show", "escape/secret.mdx"], rootDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("文档不存在");
  });

  test("workspace loading rejects an llmdoc root symlink that escapes the repository", async () => {
    const rootDir = createFixture();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-outside-root-"));
    const externalLlmdoc = path.join(outsideDir, "llmdoc");
    fs.cpSync(path.join(rootDir, "llmdoc"), externalLlmdoc, { recursive: true });
    fs.rmSync(path.join(rootDir, "llmdoc"), { recursive: true });
    fs.symlinkSync(externalLlmdoc, path.join(rootDir, "llmdoc"));

    const result = await runCli(["tree"], rootDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("符号链接逃逸");
  });

  test("context validates file inputs and paginates instead of silently truncating", async () => {
    const rootDir = createFixture();
    const result = await runCli(["context", "--files", "src/api/retry.ts", "--budget", "1"], rootDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("cursor:");

    const invalid = await runCli(["context", "--files", "../outside.ts"], rootDir);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stdout).toContain("路径必须是仓库内规范化相对路径");
  });

  test("metadata commands budget their projected output instead of full document bodies", async () => {
    const rootDir = createFixture();
    fs.appendFileSync(path.join(rootDir, "llmdoc", "api-client", "overview.mdx"), `\n${"large body ".repeat(4000)}`);

    const index = await runCli(["index", "--topic", "api-client", "--budget", "500", "--json"], rootDir);
    const payload = JSON.parse(index.stdout) as {
      documents: unknown[];
      pagination: { totalItems: number; returnedItems: number; totalEstimatedTokens: number; nextCursor: string | null };
    };

    expect(payload.pagination.totalItems).toBe(3);
    expect(payload.pagination.returnedItems).toBe(3);
    expect(payload.pagination.totalEstimatedTokens).toBeLessThan(500);
    expect(payload.pagination.nextCursor).toBeNull();
    expect(payload.documents).toHaveLength(3);

    const malformedCursor = Buffer.from(JSON.stringify({ offset: "0" })).toString("base64url");
    const invalid = await runCli(["index", "--cursor", malformedCursor], rootDir);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stdout).toContain("cursor 非法");
  });

  test("new scaffolds a document under llmdoc", async () => {
    const rootDir = createFixture();
    const result = await runCli(["new", "api-client/updating-hooks.mdx", "--kind", "guide"], rootDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("created");
    expect(fs.readFileSync(path.join(rootDir, "llmdoc", "api-client", "updating-hooks.mdx"), "utf8")).toContain("kind: guide");
  });

  test("new creates docs in fresh topics, syncs meta entry, and rejects invalid shapes or symlink escape", async () => {
    const rootDir = createFixture();
    const fresh = await runCli(["new", "fresh-topic/getting-started.mdx", "--kind", "guide"], rootDir);
    expect(fresh.exitCode).toBe(0);
    expect(fs.existsSync(path.join(rootDir, "llmdoc", "fresh-topic", "getting-started.mdx"))).toBe(true);
    const meta = readMeta(rootDir);
    expect(meta.documents["fresh-topic/getting-started.mdx"]).toBeTruthy();
    expect(meta.documents["fresh-topic/getting-started.mdx"].validatedRevision).toBeNull();

    const indexName = await runCli(["new", "fresh-topic/index.mdx", "--kind", "guide"], rootDir);
    expect(indexName.exitCode).toBe(1);
    expect(indexName.stdout).toContain("不使用 index.mdx");

    const invalidKind = await runCli(["new", "another.mdx", "--kind", "index"], rootDir);
    expect(invalidKind.exitCode).toBe(1);
    expect(invalidKind.stdout).toContain("非法 kind");

    const nested = await runCli(["new", "topic/nested/file.mdx", "--kind", "guide"], rootDir);
    expect(nested.exitCode).toBe(1);
    expect(nested.stdout).toContain("两层");

    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
    fs.symlinkSync(outsideDir, path.join(rootDir, "llmdoc", "escape-topic"));
    const escaped = await runCli(["new", "escape-topic/file.mdx", "--kind", "guide"], rootDir);
    expect(escaped.exitCode).toBe(1);
    expect(escaped.stdout).toContain("逃逸");
  });

  test("mv uses git move and rewrites links plus meta ledger", async () => {
    const rootDir = createFixture();
    fs.appendFileSync(
      path.join(rootDir, "llmdoc", "api-client", "overview.mdx"),
      "\n[query link](./retry-policy.mdx?view=full#anchor)\n\n`[inline example](./retry-policy.mdx)`\n\n```md\n[fenced example](./retry-policy.mdx)\n```\n"
    );
    const result = await runCli(["mv", "api-client/retry-policy.mdx", "api-client/retry-strategy.mdx"], rootDir);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(rootDir, "llmdoc", "api-client", "retry-strategy.mdx"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "llmdoc", "api-client", "retry-policy.mdx"))).toBe(false);

    const indexDoc = fs.readFileSync(path.join(rootDir, "llmdoc", "api-client", "overview.mdx"), "utf8");
    expect(indexDoc).toContain("retry-strategy.mdx");
    expect(indexDoc).toContain("retry-strategy.mdx?view=full#anchor");
    expect(indexDoc).toContain("`[inline example](./retry-policy.mdx)`");
    expect(indexDoc).toContain("[fenced example](./retry-policy.mdx)");

    const meta = JSON.parse(fs.readFileSync(path.join(rootDir, "llmdoc", "meta.json"), "utf8")) as {
      documents: Record<string, unknown>;
    };
    expect(meta.documents["api-client/retry-strategy.mdx"]).toBeTruthy();
    expect(meta.documents["api-client/retry-policy.mdx"]).toBeUndefined();
  });

  test("mv rejects invalid targets before git mv runs", async () => {
    const rootDir = createFixture();
    const nested = await runCli(["mv", "api-client/retry-policy.mdx", "api-client/nested/retry-policy.mdx"], rootDir);
    expect(nested.exitCode).toBe(1);
    expect(fs.existsSync(path.join(rootDir, "llmdoc", "api-client", "retry-policy.mdx"))).toBe(true);

    const wrongIndex = await runCli(["mv", "api-client/retry-policy.mdx", "api-client/index.mdx"], rootDir);
    expect(wrongIndex.exitCode).toBe(1);
    expect(wrongIndex.stdout).toContain("不使用 index.mdx");
    expect(fs.existsSync(path.join(rootDir, "llmdoc", "api-client", "retry-policy.mdx"))).toBe(true);

    const metaMove = await runCli(["mv", "meta.json", "meta2.json"], rootDir);
    expect(metaMove.exitCode).toBe(1);
    expect(fs.existsSync(path.join(rootDir, "llmdoc", "meta.json"))).toBe(true);

    // mv 到不存在的 topic 会自动创建目录(topic 即纯目录)
    const freshTopicMove = await runCli(["mv", "api-client/retry-policy.mdx", "other/retry-policy.mdx"], rootDir);
    expect(freshTopicMove.exitCode).toBe(0);
    expect(fs.existsSync(path.join(rootDir, "llmdoc", "other", "retry-policy.mdx"))).toBe(true);

    const existingTarget = await runCli(["mv", "api-client/error-model.mdx", "api-client/overview.mdx"], rootDir);
    expect(existingTarget.exitCode).toBe(1);
    expect(existingTarget.stdout).toContain("目标已存在");
  });

  test("status and delta reflect committed, dirty, unmapped, and scope-aware git state", async () => {
    const rootDir = createFixture();
    writeRepoFile(rootDir, "src/api/retry.ts", "export function isRetryable() { return false; }\n");
    commitAll(rootDir, "change retry behavior");
    writeRepoFile(rootDir, "src/api/errors.ts", "export const RETRYABLE = ['timeout', 'network'];\n");
    stageFile(rootDir, "src/api/errors.ts");
    writeRepoFile(rootDir, "src/new-feature.ts", "export const fresh = true;\n");

    const status = await runCli(["status", "--json"], rootDir);
    const statusJson = JSON.parse(status.stdout) as {
      commitsBehindHead: number;
      documents: { impacted: number; dirty: number };
      unmapped: { committed: string[]; dirty: string[] };
    };
    expect(statusJson.commitsBehindHead).toBe(1);
    expect(statusJson.documents.impacted).toBeGreaterThanOrEqual(1);
    expect(statusJson.documents.dirty).toBeGreaterThanOrEqual(1);
    expect(statusJson.unmapped.dirty).toContain("src/new-feature.ts");

    const delta = await runCli(["delta", "--scope", "api-client", "--json"], rootDir);
    const deltaJson = JSON.parse(delta.stdout) as {
      suggestedMode: string;
      impacted: Array<{ path: string; changedCommittedPaths: string[]; dirtyPaths: string[] }>;
    };
    expect(deltaJson.suggestedMode).toBe("deep");
    expect(deltaJson.impacted.some((item) => item.path === "llmdoc/api-client/retry-policy.mdx")).toBe(true);
  });

  test("delta uses per-document validatedRevision while unmapped still follows baseline", async () => {
    const rootDir = createFixture();
    writeRepoFile(rootDir, "src/api/retry.ts", "export function isRetryable() { return false; }\n");
    commitAll(rootDir, "retry update");
    const refreshed = await runCli(["fingerprint", "--update", "api-client/retry-policy.mdx"], rootDir);
    expect(refreshed.exitCode).toBe(0);

    writeRepoFile(rootDir, "src/api/errors.ts", "export const RETRYABLE = ['timeout', 'network'];\n");
    commitAll(rootDir, "error update");

    const delta = await runCli(["delta", "--json"], rootDir);
    const deltaJson = JSON.parse(delta.stdout) as {
      impacted: Array<{ path: string }>;
      unmapped: { committed: string[] };
    };
    expect(deltaJson.impacted.some((item) => item.path === "llmdoc/api-client/retry-policy.mdx")).toBe(false);
    expect(deltaJson.impacted.some((item) => item.path === "llmdoc/api-client/error-model.mdx")).toBe(true);

    writeRepoFile(rootDir, "src/unmapped.ts", "export const x = 1;\n");
    commitAll(rootDir, "unmapped");
    const withUnmapped = await runCli(["delta", "--json"], rootDir);
    const withUnmappedJson = JSON.parse(withUnmapped.stdout) as { unmapped: { committed: string[] } };
    expect(withUnmappedJson.unmapped.committed).toContain("src/unmapped.ts");
  });

  test("delta treats missing or nonexistent per-document revision as degraded impacted state, never false-clean", async () => {
    const rootDir = createFixture();
    const metaPath = path.join(rootDir, "llmdoc", "meta.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
      documents: Record<string, { validatedRevision?: string }>;
    };
    delete meta.documents["api-client/retry-policy.mdx"];
    meta.documents["api-client/error-model.mdx"]!.validatedRevision = "cafebabe";
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

    const delta = await runCli(["delta", "--json"], rootDir);
    const deltaJson = JSON.parse(delta.stdout) as {
      suggestedMode: string;
      reasons: string[];
      impacted: Array<{ path: string; changedCommittedPaths: string[]; dirtyPaths: string[] }>;
    };
    expect(deltaJson.suggestedMode).toBe("deep");
    expect(deltaJson.reasons.some((reason) => reason.includes("缺少 validatedRevision"))).toBe(true);
    expect(deltaJson.reasons.some((reason) => reason.includes("不存在于当前 git 历史"))).toBe(true);
    expect(deltaJson.impacted.some((item) => item.path === "llmdoc/api-client/retry-policy.mdx")).toBe(true);
    expect(deltaJson.impacted.some((item) => item.path === "llmdoc/api-client/error-model.mdx")).toBe(true);
  });

  test("fingerprint updates selected docs only, blocks dirty code, and all-mode advances baseline unless detached", async () => {
    const rootDir = createFixture();
    writeRepoFile(rootDir, "src/api/retry.ts", "export function isRetryable() { return false; }\n");
    commitAll(rootDir, "retry update");

    const before = readMeta(rootDir);
    const partial = await runCli(["fingerprint", "--update", "api-client/retry-policy.mdx", "--json"], rootDir);
    const partialJson = JSON.parse(partial.stdout) as { updated: string[]; baselineRevision: string };
    const afterPartial = readMeta(rootDir);
    expect(partialJson.updated).toEqual(["api-client/retry-policy.mdx"]);
    expect(afterPartial.documents["api-client/retry-policy.mdx"].validatedRevision).not.toBe(
      before.documents["api-client/retry-policy.mdx"].validatedRevision
    );
    expect(afterPartial.baseline.revision).toBe(before.baseline.revision);

    writeRepoFile(rootDir, "src/api/errors.ts", "export const RETRYABLE = ['timeout', 'network'];\n");
    const blocked = await runCli(["fingerprint", "--update", "api-client/error-model.mdx"], rootDir);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stdout).toContain("dirty");

    writeRepoFile(rootDir, "src/unmapped.ts", "export const UNMAPPED = true;\n");
    const blockedAll = await runCli(["fingerprint", "--all"], rootDir);
    expect(blockedAll.exitCode).toBe(1);
    expect(blockedAll.stdout).toContain("api-client/error-model.mdx");

    stageFile(rootDir, "src/api/errors.ts");
    commitAll(rootDir, "error update");
    // 与任何文档 code.paths 无关的 untracked 文件不阻塞全量 fingerprint。
    const all = await runCli(["fingerprint", "--all", "--json"], rootDir);
    const allJson = JSON.parse(all.stdout) as { baselineRevision: string };
    const afterAll = readMeta(rootDir);
    expect(afterAll.baseline.revision).toBe(allJson.baselineRevision);
    fs.rmSync(path.join(rootDir, "src", "unmapped.ts"));

    // detached HEAD 指向真实 commit,允许推进;只有 merge/rebase/cherry-pick 中间态才阻塞。
    detachHead(rootDir);
    const detached = await runCli(["fingerprint", "--all"], rootDir);
    expect(detached.exitCode).toBe(0);
  });

  test("hook commands fail-open and preserve their text/json contracts", async () => {
    const rootDir = createFixture();
    writeRepoFile(rootDir, "src/api/retry.ts", "export function isRetryable() { return false; }\n");
    commitAll(rootDir, "retry update");

    const sessionStart = await runCli(["hook", "session-start"], rootDir, JSON.stringify({ source: "compact" }));
    expect(sessionStart.exitCode).toBe(0);
    expect(sessionStart.stdout).toContain("compact re-entry");

    const stop = await runCli(["hook", "stop"], rootDir);
    const stopJson = JSON.parse(stop.stdout) as { continue: boolean; systemMessage?: string };
    expect(stop.exitCode).toBe(0);
    expect(Object.keys(stopJson).every((key) => key === "continue" || key === "systemMessage")).toBe(true);
    expect(stopJson.continue).toBe(true);

    const compact = await runCli(["hook", "compact"], rootDir);
    const compactJson = JSON.parse(compact.stdout) as { continue: boolean; systemMessage?: string };
    expect(compact.exitCode).toBe(0);
    expect(compactJson.continue).toBe(true);
    expect(compactJson.systemMessage).toContain("LLMDOC_STATE");

    removeGitDirectory(rootDir);
    const degradedStop = await runCli(["hook", "stop"], rootDir);
    expect(degradedStop.exitCode).toBe(0);
    expect(() => JSON.parse(degradedStop.stdout)).not.toThrow();
  });

  test("llmdoc and tmp-only changes do not become unmapped update signals", async () => {
    const rootDir = createFixture();
    writeRepoFile(rootDir, "llmdoc/api-client/overview.mdx", "---\ndescription: API client 的边界与路由。\nkind: reference\n---\n\n# API Client\n");
    writeRepoFile(rootDir, ".llmdoc-tmp/records/note.md", "scratch\n");

    const status = await runCli(["status", "--json"], rootDir);
    const statusJson = JSON.parse(status.stdout) as { unmapped: { dirty: string[] } };
    expect(statusJson.unmapped.dirty).toEqual([]);

    const stop = await runCli(["hook", "stop"], rootDir);
    const stopJson = JSON.parse(stop.stdout) as { continue: boolean; systemMessage?: string };
    expect(stopJson.continue).toBe(true);
    expect(stopJson.systemMessage).toBeUndefined();
  });

  test("prune report and upgrade inventory stay read-only and deterministic", async () => {
    const rootDir = createFixture();
    const prune = await runCli(["prune", "--report", "--json"], rootDir);
    const pruneJson = JSON.parse(prune.stdout) as {
      status: string;
      writable: boolean;
      growth: { currentDocumentCount: number };
      mergeCandidates: unknown[];
    };
    expect(pruneJson.status).toBe("dry_run");
    expect(pruneJson.writable).toBe(false);
    expect(pruneJson.growth.currentDocumentCount).toBeGreaterThan(0);
    expect(Array.isArray(pruneJson.mergeCandidates)).toBe(true);

    const v3Upgrade = await runCli(["upgrade", "--json"], rootDir);
    const v3UpgradeJson = JSON.parse(v3Upgrade.stdout) as { status: string; requiresRecorderSemanticMigration: boolean };
    expect(v3UpgradeJson.status).toBe("no_change");
    expect(v3UpgradeJson.requiresRecorderSemanticMigration).toBe(false);

    const legacyRoot = createFixture({ broken: "legacy-v2" });
    const legacyUpgrade = await runCli(["upgrade", "--json"], legacyRoot);
    const legacyUpgradeJson = JSON.parse(legacyUpgrade.stdout) as {
      status: string;
      legacyPaths: string[];
      requiresRecorderSemanticMigration: boolean;
    };
    expect(legacyUpgradeJson.status).toBe("dry_run");
    expect(legacyUpgradeJson.legacyPaths).toContain("index.md");
    expect(legacyUpgradeJson.legacyPaths).toContain("state/sync.md");
    expect(legacyUpgradeJson.requiresRecorderSemanticMigration).toBe(true);

    const invalidV3Root = createFixture();
    writeRepoFile(invalidV3Root, "llmdoc/bad-root.mdx", "---\ndescription: bad\nkind: bogus\n---\n\n# Bad\n");
    const invalidV3Upgrade = await runCli(["upgrade", "--json"], invalidV3Root);
    const invalidV3Json = JSON.parse(invalidV3Upgrade.stdout) as { status: string };
    expect(invalidV3Json.status).toBe("dry_run");
  });

  test("installed file dependency exposes executable node_modules/.bin/llmdoc", async () => {
    const packageDir = path.resolve(__dirname, "..");
    const consumerDir = fs.mkdtempSync(path.join(process.cwd(), "llmdoc-consumer-"));
    try {
      const { spawnSync } = await import("node:child_process");
      spawnSync("npm", ["init", "-y"], { cwd: consumerDir, encoding: "utf8" });
      const packageJsonPath = path.join(consumerDir, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      packageJson.dependencies = {
        ...(packageJson.dependencies ?? {}),
        "llmdoc-cli": `file:${packageDir}`
      };
      fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
      const install = spawnSync("npm", ["install"], { cwd: consumerDir, encoding: "utf8" });
      expect(install.status).toBe(0);
      const binPath = path.join(consumerDir, "node_modules", ".bin", "llmdoc");
      expect(fs.existsSync(binPath)).toBe(true);
      const mode = fs.statSync(binPath).mode & 0o111;
      expect(mode).not.toBe(0);
      const installedPackageJson = JSON.parse(fs.readFileSync(path.join(consumerDir, "node_modules", "llmdoc-cli", "package.json"), "utf8")) as {
        version: string;
      };
      expect(installedPackageJson.version).toBe("3.0.0");
      const result = spawnSync(binPath, ["--help"], { cwd: consumerDir, encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage: llmdoc");
    } finally {
      fs.rmSync(consumerDir, { recursive: true, force: true });
    }
  });

  test("json pagination omits raw items and show body appears only once", async () => {
    const rootDir = createFixture();
    const search = await runCli(["search", "重试", "--json"], rootDir);
    expect(search.stdout).not.toContain("absolutePath");
    expect(search.stdout).not.toContain("\"raw\"");
    const searchJson = JSON.parse(search.stdout) as { pagination: { totalItems: number; nextCursor: string | null } };
    expect(searchJson.pagination.totalItems).toBeGreaterThan(0);

    const show = await runCli(["--json", "show", "api-client/retry-policy.mdx"], rootDir);
    const showJson = JSON.parse(show.stdout) as { documents: Array<{ body: string }>; pagination: { returnedItems: number } };
    expect(show.stdout.match(/幂等 GET 之外的请求默认不重试/g)?.length).toBe(1);
    expect(showJson.pagination.returnedItems).toBe(1);
  });

  test("scope, kind, CodeRef, glob prefix and search cache degraded paths are enforced", async () => {
    const rootDir = createFixture();

    const badScope = await runCli(["delta", "--scope", "missing-topic"], rootDir);
    expect(badScope.exitCode).toBe(1);
    expect(badScope.stdout).toContain("scope 未命中");

    const badFingerprint = await runCli(["fingerprint", "--all", "--update", "api-client/overview.mdx"], rootDir);
    expect(badFingerprint.exitCode).toBe(1);
    expect(badFingerprint.stdout).toContain("不能同时");

    const badKindIndex = await runCli(["index", "--kind", "bad-kind"], rootDir);
    expect(badKindIndex.exitCode).toBe(1);
    expect(badKindIndex.stdout).toContain("非法 kind");

    const badKindSearch = await runCli(["search", "重试", "--kind", "bad-kind"], rootDir);
    expect(badKindSearch.exitCode).toBe(1);
    expect(badKindSearch.stdout).toContain("非法 kind");

    writeRepoFile(
      rootDir,
      "llmdoc/api-client/coderef-rules.mdx",
      `---
description: CodeRef rules.
kind: guide
code:
  paths:
    - src/*/foo.ts
---

# CodeRef Rules

\`\`\`mdx
<CodeRef symbol="fake" />
[fake](./missing.mdx)
{fake()}
\`\`\`

\`<CodeRef path="src/missing.ts" foo="x" />\`

<CodeRef symbol="dup" path="src/api/retry.ts" foo="x" />
`
    );
    const metaPath = path.join(rootDir, "llmdoc", "meta.json");
    const metaForRules = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
      schema: string;
      baseline: { revision: string; verifiedAt: string };
      documents: Record<string, { validatedRevision: string }>;
      convergence: { capturedAt: string; source: string; documentCount: number; totalEstimatedTokens: number };
    };
    metaForRules.documents["api-client/coderef-rules.mdx"] = { validatedRevision: metaForRules.baseline.revision };
    fs.writeFileSync(metaPath, `${JSON.stringify(metaForRules, null, 2)}\n`);
    writeRepoFile(rootDir, "src/team/foo.ts", "export const foo = true;\n");
    const validate = await runCli(["validate"], rootDir);
    expect(validate.exitCode).toBe(1);
    expect(validate.stdout).toContain("CodeRef 存在未知属性");
    expect(validate.stdout).not.toContain("正文链接悬空: ./missing.mdx");
    expect(validate.stdout).not.toContain("禁止在正文中使用 MDX/JS 表达式");
    expect(validate.stdout).not.toContain("code.paths 指向不存在的路径: src/*/foo.ts");

    const tmpEscape = fs.mkdtempSync(path.join(rootDir, "tmp-escape-"));
    fs.symlinkSync(tmpEscape, path.join(rootDir, ".llmdoc-tmp"));
    const searchWithSymlink = await runCli(["search", "重试"], rootDir);
    expect(searchWithSymlink.exitCode).toBe(0);
    expect(searchWithSymlink.stdout).toContain("retry-policy.mdx");

    fs.rmSync(path.join(rootDir, ".llmdoc-tmp"), { force: true });
    fs.mkdirSync(path.join(rootDir, ".llmdoc-tmp", "cache"), { recursive: true });
    fs.chmodSync(path.join(rootDir, ".llmdoc-tmp"), 0o555);
    const searchReadOnly = await runCli(["search", "重试"], rootDir);
    expect(searchReadOnly.exitCode).toBe(0);
    expect(searchReadOnly.stdout).toContain("retry-policy.mdx");
  });

  test("version/help and lint surface are publishable", async () => {
    const rootDir = createFixture();
    const version = await runCli(["--version"], rootDir);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toBe("3.0.0");
  });

  test("all public json payloads validate through runtime output schemas", async () => {
    const rootDir = createFixture();
    const treeTopics = await runCli(["--json", "tree"], rootDir);
    expect(() => JSON.parse(treeTopics.stdout)).not.toThrow();
    const treeDocs = await runCli(["--json", "tree", "--docs"], rootDir);
    expect(() => JSON.parse(treeDocs.stdout)).not.toThrow();
    const index = await runCli(["--json", "index"], rootDir);
    expect(() => JSON.parse(index.stdout)).not.toThrow();
    const show = await runCli(["--json", "show", "api-client/overview.mdx"], rootDir);
    expect(() => JSON.parse(show.stdout)).not.toThrow();
    const search = await runCli(["--json", "search", "重试"], rootDir);
    expect(() => JSON.parse(search.stdout)).not.toThrow();
    const context = await runCli(["--json", "context", "--files", "src/api/retry.ts"], rootDir);
    expect(() => JSON.parse(context.stdout)).not.toThrow();
    const validate = await runCli(["--json", "validate"], rootDir);
    expect(() => JSON.parse(validate.stdout)).not.toThrow();
    const status = await runCli(["--json", "status"], rootDir);
    expect(() => JSON.parse(status.stdout)).not.toThrow();
    const delta = await runCli(["--json", "delta"], rootDir);
    expect(() => JSON.parse(delta.stdout)).not.toThrow();
    const fingerprint = await runCli(["--json", "fingerprint", "--update", "api-client/overview.mdx"], rootDir);
    expect(() => JSON.parse(fingerprint.stdout)).not.toThrow();
    const prune = await runCli(["--json", "prune", "--report"], rootDir);
    expect(() => JSON.parse(prune.stdout)).not.toThrow();
    const upgrade = await runCli(["--json", "upgrade"], rootDir);
    expect(() => JSON.parse(upgrade.stdout)).not.toThrow();
    const created = await runCli(["--json", "new", "fresh-topic/getting-started.mdx", "--kind", "guide"], rootDir);
    expect(() => JSON.parse(created.stdout)).not.toThrow();
    const moved = await runCli(["--json", "mv", "api-client/retry-policy.mdx", "api-client/retry-strategy.mdx"], rootDir);
    expect(() => JSON.parse(moved.stdout)).not.toThrow();
    const stop = await runCli(["hook", "stop"], rootDir);
    expect(() => JSON.parse(stop.stdout)).not.toThrow();
    const compact = await runCli(["hook", "compact"], rootDir);
    expect(() => JSON.parse(compact.stdout)).not.toThrow();
  });

  test("output schema validator rejects extra fields and wrong types", () => {
    expect(() =>
      assertOutputSchema("status", {
        baseline: null,
        head: null,
        commitsBehindHead: null,
        degradedReason: null,
        documents: { total: 1, impacted: 0, needsReview: 0, dirty: 0, extra: true },
        unmapped: { committed: [], dirty: [] },
        growth: {
          currentDocumentCount: 1,
          currentTotalEstimatedTokens: 1,
          baselineDocumentCount: 1,
          baselineTotalEstimatedTokens: 1,
          documentDelta: 0,
          tokenDelta: 0,
          exceedsGate: false
        }
      })
    ).toThrow("内部输出契约错误");

    expect(() =>
      assertOutputSchema("hook", {
        continue: true,
        systemMessage: 42
      })
    ).toThrow("内部输出契约错误");
  });

  test("mv stays correct when an ancestor directory is named llmdoc", async () => {
    // 回归 H1:仓库根(或祖先)目录名恰为 llmdoc 时,相对路径推导不能错位。
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-ancestor-"));
    const rootDir = path.join(parent, "llmdoc");
    fs.cpSync(createFixture(), rootDir, { recursive: true });

    const result = await runCli(["mv", "api-client/retry-policy.mdx", "api-client/retry-rules.mdx"], rootDir);
    expect(result.exitCode).toBe(0);

    const meta = readMeta(rootDir);
    expect(meta.documents["api-client/retry-rules.mdx"]).toBeTruthy();
    expect(meta.documents["api-client/retry-policy.mdx"]).toBeUndefined();
    const indexBody = fs.readFileSync(path.join(rootDir, "llmdoc", "api-client", "overview.mdx"), "utf8");
    expect(indexBody).toContain("retry-rules.mdx");
    expect(indexBody).not.toContain("retry-policy.mdx");

    const validated = await runCli(["validate"], rootDir);
    expect(validated.exitCode).toBe(0);
  });

  test("non-ascii paths survive git status parsing", async () => {
    // 回归 H2:中文文件名不得以八进制转义形式出现,否则与 code.paths 永不匹配。
    const rootDir = createFixture();
    writeRepoFile(rootDir, "src/api/中文模块.ts", "export const 中文 = true;\n");

    const status = await runCli(["--json", "status"], rootDir);
    const payload = JSON.parse(status.stdout) as { unmapped: { dirty: string[] } };
    expect(payload.unmapped.dirty).toContain("src/api/中文模块.ts");
    expect(payload.unmapped.dirty.some((item) => item.includes("\\"))).toBe(false);
  });

  test("dot-prefixed code.paths still map to documents", async () => {
    // 回归 H3:front matter 里写 ./src/... 不能让文档静默脱离影响面。
    const rootDir = createFixture();
    fs.writeFileSync(
      path.join(rootDir, "llmdoc", "architecture.mdx"),
      `---
description: 整体架构与关键引导。
kind: architecture
code:
  paths:
    - ./src/api/retry.ts
---

# 整体架构

`
    );

    const context = await runCli(["--json", "context", "--files", "src/api/retry.ts"], rootDir);
    const payload = JSON.parse(context.stdout) as { impacted: { path: string }[] };
    expect(payload.impacted.some((item) => item.path === "llmdoc/architecture.mdx")).toBe(true);
  });

  test("invalid global option values fail cleanly instead of crashing", async () => {
    const rootDir = createFixture();
    const result = await runCli(["tree", "--limit", "abc"], rootDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("非法整数");
  });

  test("hooks stay silent in repositories without llmdoc", async () => {
    // 回归 M3:未启用 llmdoc 的项目不应被注入任何 hook 噪音。
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-bare-"));

    const sessionStart = await runCli(["hook", "session-start"], bareDir);
    expect(sessionStart.exitCode).toBe(0);
    expect(sessionStart.stdout).toBe("");

    const stop = await runCli(["hook", "stop"], bareDir);
    expect(stop.exitCode).toBe(0);
    expect(JSON.parse(stop.stdout)).toEqual({ continue: true });

    const compact = await runCli(["hook", "compact"], bareDir);
    expect(compact.exitCode).toBe(0);
    expect(JSON.parse(compact.stdout)).toEqual({ continue: true });
  });

  test("new escapes hostile descriptions into valid front matter", async () => {
    // 回归 M10:description 含引号/冒号/替换模式时仍要产出合法 YAML。
    const rootDir = createFixture();
    const hostile = `包含 "引号": 与 $& 替换模式`;
    const created = await runCli(["new", "api-client/hostile.mdx", "--kind", "guide", "--description", hostile], rootDir);
    expect(created.exitCode).toBe(0);

    const validated = await runCli(["validate"], rootDir);
    expect(validated.exitCode).toBe(0);

    const index = await runCli(["--json", "index", "--topic", "api-client"], rootDir);
    const payload = JSON.parse(index.stdout) as { documents: { path: string; description: string }[] };
    const doc = payload.documents.find((item) => item.path === "llmdoc/api-client/hostile.mdx");
    expect(doc?.description).toBe(hostile);
  });

  test("viewer server serves app shell, state, and doc detail", async () => {
    const rootDir = createFixture();
    const { startViewerServer } = await import("../src/commands/serve.js");
    const server = await startViewerServer(rootDir, 0);
    try {
      const home = await fetch(`${server.url}/`);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain("llmdoc viewer");

      const stateResponse = await fetch(`${server.url}/api/state`);
      expect(stateResponse.status).toBe(200);
      const state = (await stateResponse.json()) as {
        nodes: { path: string; status: string; topic: string | null }[];
        edges: { from: string; to: string; type: string }[];
        validate: { ok: boolean };
        baseline: { revision: string | null };
      };
      expect(state.validate.ok).toBe(true);
      expect(state.baseline.revision).toBeTruthy();
      expect(state.nodes.some((node) => node.path === "api-client/retry-policy.mdx")).toBe(true);
      // requires 边 + index.mdx 正文链接边都要进图
      expect(state.edges.some((edge) => edge.from === "api-client/retry-policy.mdx" && edge.to === "api-client/error-model.mdx" && edge.type === "requires")).toBe(true);
      expect(state.edges.some((edge) => edge.from === "api-client/overview.mdx" && edge.to === "api-client/retry-policy.mdx")).toBe(true);

      const docResponse = await fetch(`${server.url}/api/doc?path=${encodeURIComponent("api-client/retry-policy.mdx")}`);
      expect(docResponse.status).toBe(200);
      const doc = (await docResponse.json()) as { frontmatter: { kind: string }; body: string };
      expect(doc.frontmatter.kind).toBe("guide");
      expect(doc.body).toContain("CodeRef");

      const missing = await fetch(`${server.url}/api/doc?path=${encodeURIComponent("../../etc/passwd")}`);
      expect(missing.status).toBe(404);

      const markedAsset = await fetch(`${server.url}/assets/marked.js`);
      expect(markedAsset.status).toBe(200);
      expect((await markedAsset.text()).length).toBeGreaterThan(100);
    } finally {
      await server.close();
    }
  });
});
