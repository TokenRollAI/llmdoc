import fs from "node:fs";
import path from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";

import { packageRootFromImport } from "./package-root.js";

type AjvConstructor = new (options: { allErrors: boolean; strict: boolean }) => {
  compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: ErrorObject[] };
};

const Ajv2020 = Ajv2020Module as unknown as AjvConstructor;
const ajv = new Ajv2020({ allErrors: true, strict: false });

function readSchema(fileName: string): unknown {
  const packageRoot = packageRootFromImport(import.meta.url);
  const schemaPath = path.join(packageRoot, "schemas", fileName);
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

const docValidator = ajv.compile(readSchema("doc-frontmatter.schema.json"));
const metaValidator = ajv.compile(readSchema("meta.schema.json"));

export function validateDocFrontmatter(input: unknown): string[] {
  const ok = docValidator(input);
  if (ok) {
    return [];
  }
  return (docValidator.errors ?? []).map(formatAjvError);
}

export function validateMeta(input: unknown): string[] {
  const ok = metaValidator(input);
  if (!ok) {
    return (metaValidator.errors ?? []).map(formatAjvError);
  }
  const meta = input as {
    baseline: { verifiedAt: string };
    convergence: { capturedAt: string };
  };
  const errors: string[] = [];
  if (!isValidUtcTimestamp(meta.baseline.verifiedAt)) {
    errors.push("/baseline/verifiedAt must be a real RFC3339 UTC timestamp");
  }
  if (!isValidUtcTimestamp(meta.convergence.capturedAt)) {
    errors.push("/convergence/capturedAt must be a real RFC3339 UTC timestamp");
  }
  return errors;
}

function formatAjvError(error: ErrorObject): string {
  return `${error.instancePath || "/"} ${error.message ?? "invalid"}`;
}

function isValidUtcTimestamp(input: string): boolean {
  const match = input.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/
  );
  if (!match) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(hour, minute, second, 0);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute &&
    parsed.getUTCSeconds() === second
  );
}
