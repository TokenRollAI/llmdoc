import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";

import { findProjectRoot, findProjectRootOrNull } from "./lib/fs.js";
import { CliError } from "./lib/errors.js";
import { runTree } from "./commands/tree.js";
import { runIndex } from "./commands/index.js";
import { runShow } from "./commands/show.js";
import { runSearch } from "./commands/search.js";
import { runContext } from "./commands/context.js";
import { runValidate } from "./commands/validate.js";
import { runNew } from "./commands/new.js";
import { runMove } from "./commands/mv.js";
import { runStatus } from "./commands/status.js";
import { runDelta } from "./commands/delta.js";
import { runFingerprint } from "./commands/fingerprint.js";
import { runHook } from "./commands/hook.js";
import { runPrune } from "./commands/prune.js";
import { parseAndValidateJsonString, stringifyValidatedOutput, type OutputSchemaName } from "./lib/output-schema.js";
import { packageRootFromImport } from "./lib/package-root.js";

export interface RunCliResult {
  exitCode: number;
  stdout: string;
}

export async function runCli(argv: string[], cwd = process.cwd(), stdin = ""): Promise<RunCliResult> {
  if (argv.includes("--version") || argv.includes("-V")) {
    return {
      exitCode: 0,
      stdout: readPackageVersion()
    };
  }
  const program = new Command();
  const output: string[] = [];
  let exitCode = 0;
  let globalOptions: { json?: boolean; cursor?: string; budget?: number; limit?: number };
  try {
    globalOptions = parseGlobalOptions(argv);
  } catch (error) {
    if (error instanceof CliError) {
      return {
        exitCode: error.exitCode,
        stdout: error.message
      };
    }
    throw error;
  }

  program.name("llmdoc").version(readPackageVersion(), "--version", "输出 CLI 版本").showHelpAfterError();
  program.option("--json", "输出 JSON").option("--cursor <cursor>").option("--budget <budget>", "预算 token", parseInteger).option("--limit <limit>", "返回条数", parseInteger);

  program
    .command("tree")
    .description("输出 llmdoc 全局地图")
    .option("--docs", "展开到文档级")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      const result = runTree({ ...globalOptions, ...commandOptions, cwd: rootDir });
      output.push(writeOutput(commandOptions.docs ? "treeDocs" : "treeTopics", result, globalOptions.json));
    });

  program
    .command("index")
    .description("列出文档元数据索引")
    .option("--topic <topic>")
    .option("--kind <kind>")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("index", runIndex({ ...globalOptions, ...commandOptions, cwd: rootDir }), globalOptions.json));
    });

  program
    .command("show")
    .description("读取一个或多个文档正文")
    .argument("<path...>")
    .action((paths) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("show", runShow({ ...globalOptions, cwd: rootDir, paths }), globalOptions.json));
    });

  program
    .command("search")
    .description("按词法检索 llmdoc 文档")
    .argument("<query>")
    .option("--topic <topic>")
    .option("--kind <kind>")
    .action((query, commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("search", runSearch({ ...globalOptions, ...commandOptions, cwd: rootDir, query }), globalOptions.json));
    });

  program
    .command("context")
    .description("按源码文件反查应读文档")
    .requiredOption("--files <files...>")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(
        writeOutput(
          "context",
          runContext({
            ...globalOptions,
            cwd: rootDir,
            files: commandOptions.files
          }),
          globalOptions.json
        )
      );
    });

  program
    .command("validate")
    .description("校验 llmdoc 结构与引用")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      const result = runValidate({ ...globalOptions, ...commandOptions, cwd: rootDir });
      exitCode = result.exitCode;
      output.push(writeOutput("validate", result.output, globalOptions.json));
    });

  program
    .command("status")
    .description("查看 baseline、dirty 与增长状态")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("status", runStatus({ ...globalOptions, ...commandOptions, cwd: rootDir }), globalOptions.json));
    });

  program
    .command("delta")
    .description("查看代码变化对应的文档影响面")
    .option("--scope <scope...>")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("delta", runDelta({ ...globalOptions, ...commandOptions, cwd: rootDir }), globalOptions.json));
    });

  program
    .command("fingerprint")
    .description("刷新文档 validatedRevision 或 baseline")
    .option("--update <path...>")
    .option("--all", "更新全部文档并推进 baseline")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(
        writeOutput(
          "fingerprint",
          runFingerprint({
            ...globalOptions,
            cwd: rootDir,
            update: commandOptions.update,
            all: commandOptions.all
          }),
          globalOptions.json
        )
      );
    });

  program
    .command("init-state")
    .description("首次生成 llmdoc/meta.json 台账骨架(validatedRevision 全部为 null)")
    .action(async () => {
      const { runInitState } = await import("./commands/init-state.js");
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("initState", runInitState({ ...globalOptions, cwd: rootDir }), globalOptions.json));
    });

  program
    .command("commit")
    .description("一体化收尾:validate 门控 → 提交 llmdoc 写集 → fingerprint → meta 小 commit")
    .option("-m, --message <message>", "docs commit message")
    .option("--all", "fingerprint 全部文档并推进 baseline")
    .option("--no-verify", "透传 git commit --no-verify(husky 等重钩子仓库)")
    .action(async (commandOptions) => {
      const { runCommit } = await import("./commands/commit.js");
      const rootDir = findProjectRoot(cwd);
      output.push(
        writeOutput(
          "commit",
          runCommit({
            ...globalOptions,
            cwd: rootDir,
            message: commandOptions.message,
            all: commandOptions.all,
            noVerify: commandOptions.verify === false
          }),
          globalOptions.json
        )
      );
    });

  program
    .command("prune")
    .description("输出只读收敛候选报告")
    .option("--report", "输出只读收敛报告")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("prune", runPrune({ ...globalOptions, cwd: rootDir, report: commandOptions.report }), globalOptions.json));
    });

  program
    .command("upgrade")
    .description("盘点 legacy/V2 到 V3 的迁移需求")
    .action(async (commandOptions) => {
      const { runUpgrade } = await import("./commands/upgrade.js");
      const rootDir = findProjectRootOrNull(cwd) ?? cwd;
      output.push(writeOutput("upgrade", await runUpgrade({ ...globalOptions, ...commandOptions, cwd: rootDir }), globalOptions.json));
    });

  const hookCommand = program.command("hook");
  hookCommand
    .command("session-start")
    .description("输出 SessionStart 短状态信号")
    .action(() => {
      const rootDir = findProjectRootOrNull(cwd) ?? cwd;
      output.push(runHook({ cwd: rootDir, mode: "session-start", stdin }));
    });
  hookCommand
    .command("stop")
    .description("输出 Stop hook JSON 提醒")
    .action(() => {
      const rootDir = findProjectRootOrNull(cwd) ?? cwd;
      output.push(parseAndValidateJsonString("hook", runHook({ cwd: rootDir, mode: "stop", stdin })));
    });
  hookCommand
    .command("compact")
    .description("输出 PreCompact hook JSON 指令")
    .action(() => {
      const rootDir = findProjectRootOrNull(cwd) ?? cwd;
      output.push(parseAndValidateJsonString("hook", runHook({ cwd: rootDir, mode: "compact", stdin })));
    });

  program
    .command("serve")
    .description("启动本地 Web Viewer(HTTP 服务,浏览文档结构与关联,Ctrl-C 退出)")
    .option("--port <port>", "监听端口", parseInteger)
    .action(async (commandOptions) => {
      const { runServe } = await import("./commands/serve.js");
      const rootDir = findProjectRoot(cwd);
      output.push(await runServe({ cwd: rootDir, port: commandOptions.port }));
    });

  program
    .command("new")
    .argument("<path>")
    .requiredOption("--kind <kind>")
    .option("--description <description>")
    .action((targetPath, commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(
        writeOutput(
          "new",
          runNew({
            ...globalOptions,
            cwd: rootDir,
            path: targetPath,
            kind: commandOptions.kind,
            description: commandOptions.description
          }),
          globalOptions.json
        )
      );
    });

  program
    .command("mv")
    .argument("<from>")
    .argument("<to>")
    .action((from, to) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("mv", runMove({ ...globalOptions, cwd: rootDir, from, to }), globalOptions.json));
    });

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CliError) {
      return {
        exitCode: error.exitCode,
        stdout: error.message
      };
    }
    throw error;
  }

  return {
    exitCode,
    stdout: output.join("\n")
  };
}

function stringifyOutput(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function writeOutput(schemaName: OutputSchemaName, value: unknown, expectJson = false): string {
  if (expectJson) {
    return stringifyValidatedOutput(schemaName, value);
  }
  return stringifyOutput(value);
}

function parseInteger(input: string): number {
  const value = Number.parseInt(input, 10);
  if (Number.isNaN(value) || value <= 0) {
    throw new CliError(`非法整数: ${input}`);
  }
  return value;
}

function readPackageVersion(): string {
  const packageRoot = packageRootFromImport(import.meta.url);
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version: string };
  return packageJson.version;
}

function parseGlobalOptions(argv: string[]): { json?: boolean; cursor?: string; budget?: number; limit?: number } {
  const options: { json?: boolean; cursor?: string; budget?: number; limit?: number } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
    } else if (token === "--cursor" && argv[index + 1]) {
      options.cursor = argv[index + 1];
      index += 1;
    } else if (token === "--budget" && argv[index + 1]) {
      options.budget = parseInteger(argv[index + 1]!);
      index += 1;
    } else if (token === "--limit" && argv[index + 1]) {
      options.limit = parseInteger(argv[index + 1]!);
      index += 1;
    }
  }
  return options;
}
