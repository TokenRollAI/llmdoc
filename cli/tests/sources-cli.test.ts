import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "../src/cli.js";
import { commitAll, createFixture, detachHead, writeRepoFile } from "./helpers.js";

const originalLlmdocHome = process.env.LLMDOC_HOME;
const originalDisableBg = process.env.LLMDOC_DISABLE_BG_REFRESH;

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function createRemoteGitKnowledgeRepo(): {
  bareDir: string;
  workDir: string;
  url: string;
  pushFile: (relPath: string, content: string, message: string) => string;
  removeFile: (relPath: string, message: string) => string;
} {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-remote-kb-"));
  const bareDir = path.join(baseDir, "team-knowledge.git");
  const workDir = path.join(baseDir, "work");
  fs.mkdirSync(bareDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  runGit(bareDir, ["init", "--bare", "--initial-branch=main"]);
  runGit(workDir, ["init", "--initial-branch=main"]);
  runGit(workDir, ["config", "user.email", "team@example.com"]);
  runGit(workDir, ["config", "user.name", "Team Bot"]);
  runGit(workDir, ["remote", "add", "origin", bareDir]);

  const writeAndPush = (files: Record<string, string>, message: string): string => {
    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(workDir, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    runGit(workDir, ["add", "."]);
    runGit(workDir, ["commit", "-m", message]);
    runGit(workDir, ["push", "-u", "origin", "main"]);
    return runGit(workDir, ["rev-parse", "HEAD"]);
  };

  writeAndPush(
    {
      "conventions/service-baseline.md": `---
description: Team service baseline for logging, timeouts, and graceful shutdown.
kind: guide
relations:
  requires:
    - contracts/error-codes.md
---

# Service Baseline

All services must propagate request IDs and honor 30s graceful shutdown.
`,
      "conventions/contracts/error-codes.md": `---
description: Shared canonical error codes across backend microservices.
---

# Canonical Error Codes

Use \`ERR_RETRYABLE_TIMEOUT\` for upstream deadline failures.
`,
      "conventions/docker.md": `---
description: Container hardening rules for production Dockerfiles.
code:
  paths:
    - "**/Dockerfile"
---

# Dockerfile Rules

Always run as a non-root user.
`,
      "conventions/README.md": "# Unindexed README without front matter\n"
    },
    "initial team knowledge"
  );

  return {
    bareDir,
    workDir,
    url: pathToFileURL(bareDir).href,
    pushFile(relPath: string, content: string, message: string): string {
      return writeAndPush({ [relPath]: content }, message);
    },
    removeFile(relPath: string, message: string): string {
      fs.rmSync(path.join(workDir, relPath), { force: true });
      runGit(workDir, ["add", "-A"]);
      runGit(workDir, ["commit", "-m", message]);
      runGit(workDir, ["push", "origin", "main"]);
      return runGit(workDir, ["rev-parse", "HEAD"]);
    }
  };
}

describe("llmdoc external sources end-to-end", () => {
  afterEach(() => {
    if (originalLlmdocHome === undefined) {
      delete process.env.LLMDOC_HOME;
    } else {
      process.env.LLMDOC_HOME = originalLlmdocHome;
    }
    if (originalDisableBg === undefined) {
      delete process.env.LLMDOC_DISABLE_BG_REFRESH;
    } else {
      process.env.LLMDOC_DISABLE_BG_REFRESH = originalDisableBg;
    }
  });

  test("supports remote git team knowledge end-to-end: cold isolation, first read fetch, preload, shared cache, refresh, and upstream rename degradation", async () => {
    const llmdocHome = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-home-"));
    process.env.LLMDOC_HOME = llmdocHome;
    process.env.LLMDOC_DISABLE_BG_REFRESH = "1";

    const remote = createRemoteGitKnowledgeRepo();
    const consumerA = createFixture();
    writeRepoFile(
      consumerA,
      "llmdoc.config.json",
      `${JSON.stringify(
        {
          schema: "llmdoc.config/v2",
          sources: {
            team: {
              git: remote.url,
              ref: "main",
              dir: "conventions",
              refresh: "24h"
            }
          },
          startup: {
            remindSkill: false,
            preload: ["architecture.mdx", "@team/service-baseline.md"]
          }
        },
        null,
        2
      )}\n`
    );
    writeRepoFile(
      consumerA,
      "llmdoc/api-client/retry-policy.mdx",
      `---
description: 请求重试的适用条件、退避规则以及禁止重试的错误类型。
kind: guide
relations:
  requires:
    - api-client/error-model.mdx
    - "@team/service-baseline.md"
code:
  paths:
    - src/api/retry.ts
---

# 请求重试策略

幂等 GET 之外的请求默认不重试，判定入口见 <CodeRef path="src/api/retry.ts" symbol="isRetryable" />。
`
    );
    commitAll(consumerA, "wire team source and external requires");

    // 1. Cold state (no cache yet): validate warns without failing; commit succeeds offline; SessionStart still preloads local docs.
    const coldValidate = await runCli(["--json", "validate"], consumerA);
    expect(coldValidate.exitCode).toBe(0);
    const coldValidateJson = JSON.parse(coldValidate.stdout) as {
      ok: boolean;
      warnings: Array<{ code: string }>;
    };
    expect(coldValidateJson.ok).toBe(true);
    expect(coldValidateJson.warnings.some((issue) => issue.code === "source.unavailable")).toBe(true);
    expect(coldValidateJson.warnings.some((issue) => issue.code === "config.startup.preload.source-unavailable")).toBe(true);

    // Offline local show does NOT trigger cold fetch of @team.
    const localShow = await runCli(["show", "architecture.mdx"], consumerA);
    expect(localShow.exitCode).toBe(0);
    const coldTree = await runCli(["--json", "tree"], consumerA);
    expect(coldTree.exitCode).toBe(0);
    const coldTreeJson = JSON.parse(coldTree.stdout) as { sources: Array<{ name: string; status: string }> };
    expect(coldTreeJson.sources[0]).toMatchObject({ name: "team", status: "missing" });

    // Cold SessionStart injects local preload while skipping unavailable external preload individually,
    // and places the partial completion marker AFTER the skipped section.
    const coldHook = await runCli(["hook", "session-start"], consumerA);
    expect(coldHook.exitCode).toBe(0);
    expect(coldHook.stdout).toContain("=== llmdoc/architecture.mdx [architecture] (startup preload) ===");
    expect(coldHook.stdout).toContain("Skipped startup preload external document(s):");
    expect(coldHook.stdout).toContain("@team/service-baseline.md");
    expect(coldHook.stdout).toContain("=== llmdoc startup preload complete (partial: 1 external document(s) skipped) ===");
    expect(coldHook.stdout.indexOf("Skipped startup preload external document(s):")).toBeLessThan(
      coldHook.stdout.indexOf("=== llmdoc startup preload complete (partial:")
    );

    // Local commit works offline even with unavailable external source!
    fs.appendFileSync(path.join(consumerA, "llmdoc", "architecture.mdx"), "\nAdded local note while offline.\n");
    const offlineCommit = await runCli(["commit", "--all", "-m", "docs: offline update"], consumerA);
    expect(offlineCommit.exitCode).toBe(0);

    // 2. First explicit remote read triggers cold clone into LLMDOC_HOME and returns body.
    const remoteShow = await runCli(["--json", "show", "@team/service-baseline.md"], consumerA);
    expect(remoteShow.exitCode).toBe(0);
    const remoteShowJson = JSON.parse(remoteShow.stdout) as {
      documents: Array<{ path: string; source?: string; body: string }>;
    };
    expect(remoteShowJson.documents[0]).toMatchObject({
      path: "@team/service-baseline.md",
      source: "team"
    });
    expect(remoteShowJson.documents[0]?.body).toContain("30s graceful shutdown");

    // 3. Subsequent SessionStart preloads BOTH local and remote documents with provenance; compact lists both IDs only.
    const warmHook = await runCli(["hook", "session-start"], consumerA);
    expect(warmHook.exitCode).toBe(0);
    expect(warmHook.stdout).toContain("=== llmdoc/architecture.mdx [architecture] (startup preload) ===");
    expect(warmHook.stdout).toContain("=== @team/service-baseline.md [guide] (startup preload; external source @team");
    expect(warmHook.stdout).toContain("30s graceful shutdown");
    expect(warmHook.stdout).toContain("=== llmdoc startup preload complete ===");

    const compactHook = await runCli(["hook", "session-start"], consumerA, JSON.stringify({ source: "compact" }));
    expect(compactHook.stdout).toContain("llmdoc/architecture.mdx");
    expect(compactHook.stdout).toContain("@team/service-baseline.md");
    expect(compactHook.stdout).not.toContain("30s graceful shutdown");

    // 4. Retrieval commands (tree, index --topic @team / @team/contracts, search, context) all work and validate JSON schemas.
    const warmTree = await runCli(["tree"], consumerA);
    expect(warmTree.exitCode).toBe(0);
    expect(warmTree.stdout).toContain("sources  (1 configured)");
    expect(warmTree.stdout).toContain("@team");

    const pruneReport = await runCli(["--json", "prune", "--report"], consumerA);
    expect(pruneReport.exitCode).toBe(0);
    const pruneJson = JSON.parse(pruneReport.stdout) as { startupPreloads: string[] };
    expect(pruneJson.startupPreloads).toEqual(["llmdoc/architecture.mdx", "@team/service-baseline.md"]);

    const indexSubdir = await runCli(["--json", "index", "--topic", "@team/contracts"], consumerA);
    expect(indexSubdir.exitCode).toBe(0);
    const indexSubdirJson = JSON.parse(indexSubdir.stdout) as { documents: Array<{ path: string; kind: string }> };
    expect(indexSubdirJson.documents.map((doc) => doc.path)).toEqual(["@team/contracts/error-codes.md"]);
    expect(indexSubdirJson.documents[0]?.kind).toBe("reference");

    const searchRemote = await runCli(["--json", "search", "ERR_RETRYABLE_TIMEOUT"], consumerA);
    expect(searchRemote.exitCode).toBe(0);
    const searchRemoteJson = JSON.parse(searchRemote.stdout) as { results: Array<{ path: string; source?: string }> };
    expect(searchRemoteJson.results[0]).toMatchObject({ path: "@team/contracts/error-codes.md", source: "team" });

    // context traverses local -> @team/service-baseline.md -> @team/contracts/error-codes.md AND matches git glob **/Dockerfile without removing unmappedFiles!
    const ctx = await runCli(["--json", "context", "--files", "src/api/retry.ts", "deploy/Dockerfile"], consumerA);
    expect(ctx.exitCode).toBe(0);
    const ctxJson = JSON.parse(ctx.stdout) as {
      impacted: Array<{ path: string }>;
      prerequisites: Array<{ path: string }>;
      unmappedFiles: string[];
    };
    expect(ctxJson.impacted.map((d) => d.path)).toContain("@team/docker.md");
    expect(ctxJson.prerequisites.map((d) => d.path)).toContain("@team/service-baseline.md");
    expect(ctxJson.prerequisites.map((d) => d.path)).toContain("@team/contracts/error-codes.md");
    // External git match for deploy/Dockerfile MUST NOT hide missing local owner!
    expect(ctxJson.unmappedFiles).toEqual(["deploy/Dockerfile"]);

    // 5. Second consumer repo shares the cached ~/.llmdoc snapshot immediately (ready before any network read)!
    const consumerB = createFixture();
    writeRepoFile(
      consumerB,
      "llmdoc.config.json",
      `${JSON.stringify(
        {
          schema: "llmdoc.config/v2",
          sources: {
            "shared-team": {
              git: remote.url,
              ref: "main",
              dir: "conventions"
            }
          }
        },
        null,
        2
      )}\n`
    );
    const treeFromB = await runCli(["--json", "tree"], consumerB);
    expect(treeFromB.exitCode).toBe(0);
    const treeFromBJson = JSON.parse(treeFromB.stdout) as { sources: Array<{ name: string; status: string }> };
    expect(treeFromBJson.sources[0]).toMatchObject({ name: "shared-team", status: "ready" });

    const showFromB = await runCli(["show", "@shared-team/contracts/error-codes.md"], consumerB);
    expect(showFromB.exitCode).toBe(0);
    expect(showFromB.stdout).toContain("ERR_RETRYABLE_TIMEOUT");

    // 6. Upstream update + `status --refresh` brings new content atomically.
    remote.pushFile(
      "conventions/service-baseline.md",
      `---
description: Team service baseline v2.
kind: guide
---

# Service Baseline v2

Updated to 60s graceful shutdown.
`,
      "update baseline to 60s"
    );
    const statusRefresh = await runCli(["--json", "status", "--refresh"], consumerA);
    expect(statusRefresh.exitCode).toBe(0);
    const refreshedShow = await runCli(["show", "@team/service-baseline.md"], consumerA);
    expect(refreshedShow.exitCode).toBe(0);
    expect(refreshedShow.stdout).toContain("60s graceful shutdown");

    // 7. Upstream removes a referenced doc: validate warns (exit 0), context reports missingPrerequisites, show fails cleanly, commit still works!
    remote.removeFile("conventions/service-baseline.md", "rename or remove baseline");
    await runCli(["status", "--refresh"], consumerA);

    const postRenameValidate = await runCli(["--json", "validate"], consumerA);
    expect(postRenameValidate.exitCode).toBe(0);
    const postRenameJson = JSON.parse(postRenameValidate.stdout) as { warnings: Array<{ code: string }> };
    expect(postRenameJson.warnings.some((issue) => issue.code === "config.startup.preload.source-missing")).toBe(true);
    expect(postRenameJson.warnings.some((issue) => issue.code === "relations.requires.source-missing")).toBe(true);

    const postRenameContext = await runCli(["--json", "context", "--files", "src/api/retry.ts"], consumerA);
    expect(postRenameContext.exitCode).toBe(0);
    const postRenameCtxJson = JSON.parse(postRenameContext.stdout) as {
      missingPrerequisites?: Array<{ path: string; reason: string }>;
    };
    expect(postRenameCtxJson.missingPrerequisites?.[0]?.path).toBe("@team/service-baseline.md");

    const missingShow = await runCli(["show", "@team/service-baseline.md"], consumerA);
    expect(missingShow.exitCode).toBe(1);
  });

  test("supports path sources with subtree-scoped matching and rejects mutation/detached-head hazards", async () => {
    const rootDir = createFixture();
    // Mount a path source at libs/shared-proto with its own llmdoc/ directory.
    writeRepoFile(
      rootDir,
      "libs/shared-proto/llmdoc/contracts/order.md",
      `---
description: Order protobuf contract owned by shared-proto.
code:
  paths:
    - proto/**
---

# Order Proto Contract

Order IDs are opaque UUID strings.
`
    );
    writeRepoFile(rootDir, "libs/shared-proto/proto/order.proto", "message Order { string id = 1; }\n");
    writeRepoFile(rootDir, "proto/local.proto", "message LocalOnly { string id = 1; }\n");
    writeRepoFile(
      rootDir,
      "llmdoc.config.json",
      `${JSON.stringify(
        {
          schema: "llmdoc.config/v2",
          sources: {
            shared: { path: "libs/shared-proto" }
          }
        },
        null,
        2
      )}\n`
    );
    commitAll(rootDir, "add shared-proto path source");

    // 1. Subtree file hits @shared/contracts/order.md, while consumer root proto/local.proto does NOT falsely match!
    const subtreeCtx = await runCli(
      ["--json", "context", "--files", "libs/shared-proto/proto/order.proto", "proto/local.proto"],
      rootDir
    );
    expect(subtreeCtx.exitCode).toBe(0);
    const subtreeJson = JSON.parse(subtreeCtx.stdout) as {
      impacted: Array<{ path: string }>;
      unmappedFiles: string[];
    };
    expect(subtreeJson.impacted.map((d) => d.path)).toEqual(["@shared/contracts/order.md"]);

    const rootProtoCtx = await runCli(["--json", "context", "--files", "proto/local.proto"], rootDir);
    const rootProtoJson = JSON.parse(rootProtoCtx.stdout) as { impacted: Array<{ path: string }>; unmappedFiles: string[] };
    expect(rootProtoJson.impacted).toEqual([]);
    expect(rootProtoJson.unmappedFiles).toEqual(["proto/local.proto"]);

    // 2. Mutation commands strictly reject @ source references and reserved @ topic prefix.
    expect((await runCli(["new", "@shared/test.mdx", "--kind", "reference"], rootDir)).exitCode).toBe(1);
    expect((await runCli(["new", "llmdoc/@team/test.mdx", "--kind", "reference"], rootDir)).exitCode).toBe(1);
    expect((await runCli(["adopt", "@shared/contracts/order.md"], rootDir)).exitCode).toBe(1);
    expect((await runCli(["mv", "@shared/contracts/order.md", "architecture.mdx"], rootDir)).exitCode).toBe(1);
    expect((await runCli(["fingerprint", "--update", "@shared/contracts/order.md"], rootDir)).exitCode).toBe(1);
    expect((await runCli(["commit", "--verified", "@shared/contracts/order.md"], rootDir)).exitCode).toBe(1);

    // 3. Detached HEAD is rejected by `commit` before any git mutation, while `fingerprint --all` still works.
    detachHead(rootDir);
    const detachedCommit = await runCli(["commit", "--all"], rootDir);
    expect(detachedCommit.exitCode).toBe(70);
    expect(detachedCommit.stdout).toContain("detached HEAD");

    const detachedFp = await runCli(["fingerprint", "--all"], rootDir);
    expect(detachedFp.exitCode).toBe(0);
  });

  test("reports clear upgrade diagnostic for unsupported future config schema versions", async () => {
    const rootDir = createFixture();
    writeRepoFile(
      rootDir,
      "llmdoc.config.json",
      `${JSON.stringify({ schema: "llmdoc.config/v99" }, null, 2)}\n`
    );

    const validate = await runCli(["--json", "validate"], rootDir);
    expect(validate.exitCode).toBe(1);
    const validateJson = JSON.parse(validate.stdout) as { errors: Array<{ code: string; message: string }> };
    expect(validateJson.errors[0]?.code).toBe("config.schema.unsupported");
    expect(validateJson.errors[0]?.message).toContain("newer than this CLI supports");

    const hook = await runCli(["hook", "session-start"], rootDir);
    expect(hook.exitCode).toBe(0);
    expect(hook.stdout).toContain("newer than this CLI supports");
  });

  test("triggers real non-blocking background refresh on stale git sources via SessionStart", async () => {
    const llmdocHome = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-home-bg-"));
    process.env.LLMDOC_HOME = llmdocHome;
    delete process.env.LLMDOC_DISABLE_BG_REFRESH;

    const remote = createRemoteGitKnowledgeRepo();
    const consumer = createFixture();
    writeRepoFile(
      consumer,
      "llmdoc.config.json",
      `${JSON.stringify(
        {
          schema: "llmdoc.config/v2",
          sources: {
            team: {
              git: remote.url,
              ref: "main",
              dir: "conventions",
              refresh: "1m"
            }
          },
          startup: {
            remindSkill: false,
            preload: ["@team/service-baseline.md"]
          }
        },
        null,
        2
      )}\n`
    );

    // Seed initial snapshot.
    const initial = await runCli(["show", "@team/service-baseline.md"], consumer);
    expect(initial.exitCode).toBe(0);
    expect(initial.stdout).toContain("30s graceful shutdown");

    // Push upstream update and backdate lastSyncedAt in state.json to mark cache stale.
    remote.pushFile(
      "conventions/service-baseline.md",
      `---
description: Team service baseline refreshed in background.
kind: guide
---

# Service Baseline BG

Refreshed to 90s graceful shutdown.
`,
      "update to 90s"
    );
    const sourcesDir = path.join(llmdocHome, "sources", "v1");
    const [cacheKey] = fs.readdirSync(sourcesDir);
    const stateFile = path.join(sourcesDir, cacheKey!, "state.json");
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8")) as { lastSyncedAt: string };
    state.lastSyncedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    fs.writeFileSync(stateFile, JSON.stringify(state));

    // SessionStart returns the cached snapshot immediately (zero foreground wait) and kicks off background refresh.
    const hook = await runCli(["hook", "session-start"], consumer);
    expect(hook.exitCode).toBe(0);
    expect(hook.stdout).toContain("30s graceful shutdown");

    // Wait briefly for detached background worker to atomically swap snapshot.
    const deadline = Date.now() + 5_000;
    let refreshedBody = "";
    while (Date.now() < deadline) {
      const next = await runCli(["show", "@team/service-baseline.md"], consumer);
      refreshedBody = next.stdout;
      if (refreshedBody.includes("90s graceful shutdown")) {
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    expect(refreshedBody).toContain("90s graceful shutdown");
  });

  test("supports gitignored llmdoc.config.local.json sibling repo mounts and alias overrides", async () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-local-override-"));
    const siblingDir = path.join(parentDir, "sibling-backend");
    fs.mkdirSync(path.join(siblingDir, "llmdoc"), { recursive: true });
    fs.writeFileSync(
      path.join(siblingDir, "llmdoc", "api.mdx"),
      `---
description: Live unpushed sibling backend API contract.
kind: reference
---

# Sibling Backend API

Live local endpoint: POST /v2/orders.
`
    );

    const consumer = createFixture();
    const relToSibling = path.relative(consumer, siblingDir);
    // Tracked config points @backend to an unreachable remote, while local override redirects @backend to ../sibling-backend!
    writeRepoFile(
      consumer,
      "llmdoc.config.json",
      `${JSON.stringify(
        {
          schema: "llmdoc.config/v2",
          sources: {
            backend: { git: "file:///does-not-exist/backend.git", ref: "main" }
          }
        },
        null,
        2
      )}\n`
    );
    commitAll(consumer, "add tracked remote backend source");

    writeRepoFile(
      consumer,
      "llmdoc.config.local.json",
      `${JSON.stringify(
        {
          schema: "llmdoc.config/v2",
          sources: {
            backend: { path: relToSibling }
          },
          startup: {
            preload: ["@backend/api.mdx"]
          }
        },
        null,
        2
      )}\n`
    );

    // Local override is ignored by implementation surface and resolves live sibling docs without network.
    const status = await runCli(["--json", "status"], consumer);
    expect(status.exitCode).toBe(0);
    const statusJson = JSON.parse(status.stdout) as { unmapped: { dirty: string[] }; sources: Array<{ name: string; kind: string; status: string }> };
    expect(statusJson.unmapped.dirty).not.toContain("llmdoc.config.local.json");
    expect(statusJson.sources[0]).toMatchObject({ name: "backend", kind: "path", status: "ready" });

    const show = await runCli(["show", "@backend/api.mdx"], consumer);
    expect(show.exitCode).toBe(0);
    expect(show.stdout).toContain("POST /v2/orders");

    const validate = await runCli(["--json", "validate"], consumer);
    expect(validate.exitCode).toBe(0);
    const validateJson = JSON.parse(validate.stdout) as { warnings: Array<{ code: string }> };
    expect(validateJson.warnings.some((issue) => issue.code === "config.local.tracked")).toBe(false);

    // Tracking llmdoc.config.local.json in git triggers a warning.
    commitAll(consumer, "accidentally track local config");
    const trackedValidate = await runCli(["--json", "validate"], consumer);
    expect(trackedValidate.exitCode).toBe(0);
    const trackedJson = JSON.parse(trackedValidate.stdout) as { warnings: Array<{ code: string }> };
    expect(trackedJson.warnings.some((issue) => issue.code === "config.local.tracked")).toBe(true);
  });

  test("enforces privacy, scoped subtree export, multi-dir isolation, refresh exit code, and YAML/mv safety", async () => {
    const llmdocHome = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-home-hardening-"));
    process.env.LLMDOC_HOME = llmdocHome;
    process.env.LLMDOC_DISABLE_BG_REFRESH = "1";

    const remote = createRemoteGitKnowledgeRepo();
    remote.pushFile("src/giant-unrelated.ts", "export const SECRET_UNRELATED_SRC = true;\n", "add unrelated src file");

    const consumer = createFixture();
    writeRepoFile(
      consumer,
      "llmdoc.config.json",
      `${JSON.stringify(
        {
          schema: "llmdoc.config/v2",
          sources: {
            broken: { git: remote.url, ref: "main", dir: "nonexistent-dir" },
            team: { git: remote.url, ref: "main", dir: "conventions" }
          }
        },
        null,
        2
      )}\n`
    );

    // 1. status --refresh fails (exit 1) because @broken's dir is invalid, while @team STILL succeeds independently!
    const refresh = await runCli(["--json", "status", "--refresh"], consumer);
    expect(refresh.exitCode).toBe(1);
    const refreshJson = JSON.parse(refresh.stdout) as {
      sources: Array<{ name: string; status: string; error: string | null }>;
    };
    expect(refreshJson.sources.find((s) => s.name === "broken")).toMatchObject({ status: "error" });
    expect(refreshJson.sources.find((s) => s.name === "team")).toMatchObject({ status: "ready", error: null });

    // 2. Scoped subtree export did NOT write unrelated src/giant-unrelated.ts into the @team snapshot!
    const snapshotsRoot = path.join(llmdocHome, "sources", "v1");
    const allSnapshotFiles: string[] = [];
    const walkFiles = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkFiles(full);
        else allSnapshotFiles.push(full);
      }
    };
    walkFiles(snapshotsRoot);
    expect(allSnapshotFiles.some((f) => f.endsWith("giant-unrelated.ts"))).toBe(false);

    // 3. Search cache in consumer repo MUST NOT persist external private source bodies or LLMDOC_HOME paths!
    const search = await runCli(["search", "ERR_RETRYABLE_TIMEOUT"], consumer);
    expect(search.exitCode).toBe(0);
    expect(search.stdout).toContain("@team/contracts/error-codes.md");
    const searchCacheFile = path.join(consumer, ".llmdoc-tmp", "cache", "search-index.json");
    const searchCacheText = fs.readFileSync(searchCacheFile, "utf8");
    expect(searchCacheText).not.toContain("err_retryable_timeout");
    expect(searchCacheText).not.toContain(llmdocHome);

    // 4. Unquoted @ in YAML gives clear hint and does NOT emit false meta.entry.orphaned; bad ref fails offline validate!
    writeRepoFile(
      consumer,
      "llmdoc/api-client/retry-policy.mdx",
      "---\ndescription: test\nkind: guide\nrelations:\n  requires:\n    - @team/service-baseline.md\n---\n\n# Retry\n"
    );
    const badYamlValidate = await runCli(["--json", "validate"], consumer);
    expect(badYamlValidate.exitCode).toBe(1);
    const badYamlJson = JSON.parse(badYamlValidate.stdout) as { errors: Array<{ code: string; message: string }> };
    expect(badYamlJson.errors.some((e) => e.code === "frontmatter.parse" && e.message.includes('must be quoted'))).toBe(true);
    expect(badYamlJson.errors.some((e) => e.code === "meta.entry.orphaned")).toBe(false);

    // 5. mv rewrite preserves body starting with ---js verbatim without executing JS!
    writeRepoFile(
      consumer,
      "llmdoc/api-client/retry-policy.mdx",
      "---\ndescription: Safe rewrite test.\nkind: guide\n---\n\n---js\nthrow new Error('SHOULD_NOT_RUN')\n---\n\n# Safe Body\n"
    );
    commitAll(consumer, "restore valid retry doc with ---js body");
    const moved = await runCli(["mv", "api-client/retry-policy.mdx", "api-client/retry-v2.mdx"], consumer);
    expect(moved.exitCode).toBe(0);
    const movedText = fs.readFileSync(path.join(consumer, "llmdoc", "api-client", "retry-v2.mdx"), "utf8");
    expect(movedText).toContain("---js\nthrow new Error('SHOULD_NOT_RUN')\n---");

    // 6. Invalid git ref like a..b is rejected offline during validate.
    writeRepoFile(
      consumer,
      "llmdoc.config.json",
      `${JSON.stringify({ schema: "llmdoc.config/v2", sources: { bad: { git: remote.url, ref: "main..other" } } }, null, 2)}\n`
    );
    const badRefValidate = await runCli(["--json", "validate"], consumer);
    expect(badRefValidate.exitCode).toBe(1);
    const badRefJson = JSON.parse(badRefValidate.stdout) as { errors: Array<{ code: string }> };
    expect(badRefJson.errors.some((e) => e.code === "config.sources.ref.invalid")).toBe(true);
  });
});
