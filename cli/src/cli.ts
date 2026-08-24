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

  program
    .name("llmdoc")
    .description("面向 LLM 的项目知识库 CLI:渐进检索 llmdoc/ 文档,维护 revision 台账")
    .version(readPackageVersion(), "--version", "输出 CLI 版本")
    .helpOption("-h, --help", "显示帮助")
    .helpCommand("help [command]", "显示指定命令的帮助")
    .showHelpAfterError("(用 --help 查看用法)");
  program
    .option("--json", "以 JSON 输出(经 schema 校验)")
    .option("--cursor <cursor>", "上次输出截断处的游标,从该处继续")
    .option("--budget <tokens>", "输出 token 预算,超出即截断并返回 cursor", parseInteger)
    .option("--limit <n>", "最多返回条数", parseInteger);
  program.addHelpText(
    "after",
    [
      "",
      "按用途速查:",
      "  检索(只读)   tree → index / search / context → show",
      "  状态诊断     status · delta · validate",
      "  结构改写     new · mv · fingerprint · init-state · commit",
      "  维护诊断     prune · upgrade",
      "  集成         hook · serve",
      "",
      "常用示例:",
      "  llmdoc tree --docs                        全局地图,展开到文档级",
      "  llmdoc search \"重试策略\" --limit 5         词法检索文档",
      "  llmdoc context --files src/api/retry.ts   按源码反查应读文档",
      "  llmdoc show api-client/retry-policy.mdx   读取正文",
      "  llmdoc commit -m \"docs: ...\"              校验并提交 llmdoc 写集",
      "",
      "所有检索命令支持 --json / --budget / --limit;输出被截断时带 --cursor 继续。"
    ].join("\n")
  );

  program
    .command("tree")
    .description("输出 llmdoc 全局地图(默认停在 topic 层)")
    .option("--docs", "展开到文档级")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      const result = runTree({ ...globalOptions, ...commandOptions, cwd: rootDir });
      output.push(writeOutput(commandOptions.docs ? "treeDocs" : "treeTopics", result, globalOptions.json));
    });

  program
    .command("index")
    .description("列出文档元数据索引(不读正文即可判断相关性)")
    .option("--topic <topic>", "只列指定 topic 下的文档")
    .option("--kind <kind>", "只列指定类型: architecture | guide | reference")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("index", runIndex({ ...globalOptions, ...commandOptions, cwd: rootDir }), globalOptions.json));
    });

  program
    .command("show")
    .description("读取一个或多个文档正文")
    .argument("<path...>", "llmdoc/ 下的相对路径,如 api-client/retry-policy.mdx")
    .action((paths) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("show", runShow({ ...globalOptions, cwd: rootDir, paths }), globalOptions.json));
    });

  program
    .command("search")
    .description("按词法检索 llmdoc 文档(front matter、标题与正文,返回 snippet)")
    .argument("<query>", "检索词")
    .option("--topic <topic>", "限定 topic")
    .option("--kind <kind>", "限定类型: architecture | guide | reference")
    .action((query, commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("search", runSearch({ ...globalOptions, ...commandOptions, cwd: rootDir, query }), globalOptions.json));
    });

  program
    .command("context")
    .description("按源码文件反查应读文档(含 requires 前置闭包)")
    .requiredOption("--files <files...>", "源码文件路径,可多个")
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
    .description("查看代码变化对应的文档影响面(决定 update 走 light 还是 deep)")
    .option("--scope <scope...>", "限定参与比对的代码路径")
    .action((commandOptions) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("delta", runDelta({ ...globalOptions, ...commandOptions, cwd: rootDir }), globalOptions.json));
    });

  program
    .command("fingerprint")
    .description("把文档 validatedRevision 刷新到当前 HEAD")
    .option("--update <path...>", "只刷新指定文档")
    .option("--all", "刷新全部文档并推进 baseline")
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
    .command("new")
    .description("在 llmdoc/ 下生成文档脚手架")
    .argument("<path>", "目标相对路径,如 api-client/retry-policy.mdx")
    .requiredOption("--kind <kind>", "文档类型: architecture | guide | reference")
    .option("--description <description>", "front matter 一句话描述")
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
    .description("移动/重命名文档或整个 topic,并重写内部引用")
    .argument("<from>", "源路径")
    .argument("<to>", "目标路径")
    .action((from, to) => {
      const rootDir = findProjectRoot(cwd);
      output.push(writeOutput("mv", runMove({ ...globalOptions, cwd: rootDir, from, to }), globalOptions.json));
    });

  program
    .command("prune")
    .description("输出只读收敛报告(增长趋势、重复候选、小文档合并候选)")
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

  const hookCommand = program.command("hook").description("供编辑器/Agent hooks 调用的只读信号(异常时 fail-open)");
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
