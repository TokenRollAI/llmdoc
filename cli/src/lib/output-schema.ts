import fs from "node:fs";
import path from "node:path";

import Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import { CliError } from "./errors.js";
import { packageRootFromImport } from "./package-root.js";

export type OutputSchemaName =
  | "treeTopics"
  | "treeDocs"
  | "index"
  | "show"
  | "search"
  | "context"
  | "validate"
  | "status"
  | "delta"
  | "fingerprint"
  | "prune"
  | "upgrade"
  | "new"
  | "mv"
  | "hook";

type AjvConstructor = new (options: { allErrors: boolean; strict: boolean }) => {
  compile: (schema: unknown) => ValidateFunction;
};

const Ajv2020 = Ajv2020Module as unknown as AjvConstructor;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new Map<OutputSchemaName, ValidateFunction>();
const schemaDocument = readOutputSchema();

export function assertOutputSchema(name: OutputSchemaName, payload: unknown): void {
  const validator = getValidator(name);
  const ok = validator(payload);
  if (ok) {
    return;
  }
  throw new CliError(`内部输出契约错误(${name}): ${formatErrors(validator.errors ?? [])}`, 70);
}

export function stringifyValidatedOutput(name: OutputSchemaName, payload: unknown): string {
  assertOutputSchema(name, payload);
  return JSON.stringify(payload, null, 2);
}

export function parseAndValidateJsonString(name: OutputSchemaName, input: string): string {
  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch (error) {
    throw new CliError(`内部输出契约错误(${name}): JSON 解析失败: ${(error as Error).message}`, 70);
  }
  return stringifyValidatedOutput(name, payload);
}

function getValidator(name: OutputSchemaName): ValidateFunction {
  const existing = validators.get(name);
  if (existing) {
    return existing;
  }
  const defs = (schemaDocument as { $defs?: Record<string, unknown> }).$defs;
  if (!defs?.[name]) {
    throw new CliError(`内部输出契约错误: 未找到 schema ${name}`, 70);
  }
  const validator = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $ref: `#/$defs/${name}`,
    $defs: defs
  });
  validators.set(name, validator);
  return validator;
}

function readOutputSchema(): unknown {
  const packageRoot = packageRootFromImport(import.meta.url);
  const schemaPath = path.join(packageRoot, "schemas", "output.schema.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function formatErrors(errors: ErrorObject[]): string {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ");
}
