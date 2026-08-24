import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

interface FixtureOptions {
  broken?:
    | "legacy-index-node"
    | "dangling-link"
    | "meta-mismatch"
    | "invalid-yaml"
    | "invalid-meta-json"
    | "forbidden-jsx"
    | "non-mdx-file"
    | "invalid-revision"
    | "legacy-v2"
    | "invalid-timestamp";
  withSymlinkEscape?: boolean;
}

export function createFixture(options: FixtureOptions = {}): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-fixture-"));
  fs.mkdirSync(path.join(rootDir, "src", "api"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "src", "api", "retry.ts"), "export function isRetryable() { return true; }\n");
  fs.writeFileSync(path.join(rootDir, "src", "api", "errors.ts"), "export const RETRYABLE = ['timeout'];\n");

  const llmdocDir = path.join(rootDir, "llmdoc");
  if (options.broken === "legacy-v2") {
    fs.mkdirSync(path.join(llmdocDir, "must"), { recursive: true });
    fs.mkdirSync(path.join(llmdocDir, "overview"), { recursive: true });
    fs.mkdirSync(path.join(llmdocDir, "memory"), { recursive: true });
    fs.mkdirSync(path.join(llmdocDir, "state"), { recursive: true });
    fs.writeFileSync(path.join(llmdocDir, "index.md"), "# V2 Index\n");
    fs.writeFileSync(path.join(llmdocDir, "startup.md"), "# V2 Startup\n");
    fs.writeFileSync(path.join(llmdocDir, "must", "project-basics.md"), "# Basics\n");
    fs.writeFileSync(path.join(llmdocDir, "state", "sync.md"), "watermark-commit: deadbeef\n");
    initGit(rootDir);
    return rootDir;
  }

  fs.mkdirSync(path.join(llmdocDir, "api-client"), { recursive: true });
  fs.writeFileSync(
    path.join(llmdocDir, "architecture.mdx"),
    `---
description: 整体架构与关键引导。
kind: architecture
code:
  paths:
    - src/api/retry.ts
---

# 整体架构

`
  );
  fs.writeFileSync(
    path.join(llmdocDir, "api-client", "overview.mdx"),
    `---
description: API client 的边界与路由。
kind: reference
relations:
  related:
    - api-client/retry-policy.mdx
code:
  paths:
    - src/api/retry.ts
---

# API Client

改重试策略前先看 [重试策略](./retry-policy.mdx)。
`
  );
  fs.writeFileSync(
    path.join(llmdocDir, "api-client", "error-model.mdx"),
    `---
description: 错误分类与可重试判定来源。
kind: reference
code:
  paths:
    - src/api/errors.ts
---

# 错误模型

`
  );
  fs.writeFileSync(
    path.join(llmdocDir, "api-client", "retry-policy.mdx"),
    `---
description: 请求重试的适用条件、退避规则以及禁止重试的错误类型。
kind: guide
relations:
  requires:
    - api-client/error-model.mdx
code:
  paths:
    - src/api/retry.ts
---

# 请求重试策略

幂等 GET 之外的请求默认不重试，判定入口见 <CodeRef path="src/api/retry.ts" symbol="isRetryable" />。
`
  );

  if (options.broken === "invalid-yaml") {
    fs.writeFileSync(
      path.join(llmdocDir, "api-client", "retry-policy.mdx"),
      `---
description: broken
kind: guide
relations:
  requires:
    - [oops
---

# Broken
`
    );
  }
  if (options.broken === "forbidden-jsx") {
    fs.writeFileSync(
      path.join(llmdocDir, "api-client", "retry-policy.mdx"),
      `---
description: 请求重试的适用条件、退避规则以及禁止重试的错误类型。
kind: guide
relations:
  requires:
    - api-client/error-model.mdx
code:
  paths:
    - src/api/retry.ts
---

import Demo from "./demo";

# 请求重试策略

<Widget />
{dangerous()}
`
    );
  }
  if (options.broken === "legacy-index-node") {
    fs.writeFileSync(
      path.join(llmdocDir, "api-client", "index.mdx"),
      `---
description: 旧式 topic 入口节点。
kind: reference
---

# API Client
`
    );
  }
  if (options.broken === "dangling-link") {
    fs.writeFileSync(
      path.join(llmdocDir, "api-client", "overview.mdx"),
      `---
description: API client 的边界与路由。
kind: reference
code:
  paths:
    - src/api/retry.ts
---

# API Client

改重试策略前先看 [不存在](./missing.mdx)。
`
    );
  }
  if (options.broken === "non-mdx-file") {
    fs.writeFileSync(path.join(llmdocDir, "notes.txt"), "not allowed\n");
  }

  const meta = {
    schema: "llmdoc.meta/v3",
    baseline: {
      revision: "abc123",
      verifiedAt: "2026-08-24T00:00:00Z"
    },
    documents: {
      "architecture.mdx": { validatedRevision: "abc123" },
      "api-client/overview.mdx": { validatedRevision: "abc123" },
      "api-client/error-model.mdx": { validatedRevision: "abc123" },
      "api-client/retry-policy.mdx": { validatedRevision: "abc123" }
    },
    convergence: {
      capturedAt: "2026-08-24T00:00:00Z",
      source: "init",
      documentCount: 4,
      totalEstimatedTokens: 80
    }
  };

  if (options.broken === "meta-mismatch") {
    Reflect.deleteProperty(meta.documents, "api-client/error-model.mdx");
  }

  fs.writeFileSync(path.join(llmdocDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  if (options.broken === "invalid-meta-json") {
    fs.writeFileSync(path.join(llmdocDir, "meta.json"), "{ invalid json }\n");
  }

  if (options.withSymlinkEscape) {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmdoc-outside-"));
    fs.writeFileSync(path.join(outsideDir, "secret.mdx"), "# secret\n");
    fs.symlinkSync(outsideDir, path.join(llmdocDir, "escape"));
  }

  initGit(rootDir);
  const revision = currentHead(rootDir);
  if (options.broken === "invalid-revision") {
    const invalidMeta = {
      ...meta,
      baseline: {
        ...meta.baseline,
        revision: "deadbeef"
      },
      documents: Object.fromEntries(
        Object.keys(meta.documents).map((docPath) => [docPath, { validatedRevision: "cafebabe" }])
      )
    };
    fs.writeFileSync(path.join(llmdocDir, "meta.json"), `${JSON.stringify(invalidMeta, null, 2)}\n`);
  } else if (options.broken === "invalid-timestamp") {
    const invalidMeta = {
      ...meta,
      baseline: {
        ...meta.baseline,
        verifiedAt: "2026-02-30T00:00:00Z"
      },
      convergence: {
        ...meta.convergence,
        capturedAt: "2026-13-01T00:00:00Z"
      }
    };
    fs.writeFileSync(path.join(llmdocDir, "meta.json"), `${JSON.stringify(invalidMeta, null, 2)}\n`);
  } else if (options.broken !== "invalid-meta-json") {
    const validMeta = {
      ...meta,
      baseline: {
        ...meta.baseline,
        revision
      },
      documents: Object.fromEntries(
        Object.keys(meta.documents).map((docPath) => [docPath, { validatedRevision: revision }])
      )
    };
    fs.writeFileSync(path.join(llmdocDir, "meta.json"), `${JSON.stringify(validMeta, null, 2)}\n`);
  }
  return rootDir;
}

export function writeRepoFile(rootDir: string, repoRelativePath: string, content: string): void {
  const absolutePath = path.join(rootDir, repoRelativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

export function stageFile(rootDir: string, repoRelativePath: string): void {
  spawnSync("git", ["add", repoRelativePath], { cwd: rootDir, encoding: "utf8" });
}

export function commitAll(rootDir: string, message: string): void {
  spawnSync("git", ["add", "."], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", message], { cwd: rootDir, encoding: "utf8" });
}

export function detachHead(rootDir: string): void {
  const head = currentHead(rootDir);
  spawnSync("git", ["checkout", "--detach", head], { cwd: rootDir, encoding: "utf8" });
}

export function removeGitDirectory(rootDir: string): void {
  fs.rmSync(path.join(rootDir, ".git"), { recursive: true, force: true });
}

export function readMeta(rootDir: string): {
  baseline: { revision: string; verifiedAt: string };
  documents: Record<string, { validatedRevision: string }>;
} {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "llmdoc", "meta.json"), "utf8")) as {
    baseline: { revision: string; verifiedAt: string };
    documents: Record<string, { validatedRevision: string }>;
  };
}

function initGit(rootDir: string): void {
  spawnSync("git", ["init"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Test User"], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["add", "."], { cwd: rootDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: rootDir, encoding: "utf8" });
}

function currentHead(rootDir: string): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).stdout.trim();
}
