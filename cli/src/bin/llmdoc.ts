#!/usr/bin/env node

import { runCli } from "../cli.js";

try {
  const stdin = process.argv[2] === "hook" ? await readStdin() : "";
  const result = await runCli(process.argv.slice(2), process.cwd(), stdin);
  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`);
  }
  process.exit(result.exitCode);
} catch (error) {
  process.stderr.write(`llmdoc: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(70);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
