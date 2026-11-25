import type { ParsedDocument } from "../types.js";
import { CliError } from "./errors.js";
import { normalizeRepoRelativePath } from "./fs.js";

export const SOURCE_ALIAS_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isValidSourceAlias(alias: string): boolean {
  return SOURCE_ALIAS_PATTERN.test(alias);
}

export function isSourceRef(input: string): boolean {
  return input.trim().startsWith("@");
}

export function formatDocumentPath(doc: Pick<ParsedDocument, "llmdocPath" | "sourceName">): string {
  return doc.sourceName ? doc.llmdocPath : `llmdoc/${doc.llmdocPath}`;
}

function relativePath(input: string): string {
  const normalized = input.replaceAll("\\", "/");
  if (/[\p{Cc}<>:"|?*]/u.test(normalized) || normalized.split("/").includes(".")) {
    throw new CliError(`Invalid source path: ${input}`);
  }
  return normalizeRepoRelativePath(normalized);
}

export function normalizeSourceSubdir(input: string): string {
  return relativePath(input.replaceAll("\\", "/").replace(/\/$/u, ""));
}

function splitRef(input: string): { alias: string; rest: string[] } {
  const [prefix, ...rest] = input.trim().replaceAll("\\", "/").split("/");
  const alias = prefix.slice(1);
  if (!prefix.startsWith("@") || !isValidSourceAlias(alias)) {
    throw new CliError(`Invalid source alias: ${prefix}`);
  }
  return { alias, rest };
}

export function parseSourceDocId(input: string): { alias: string; relativePath: string; canonicalId: string } {
  const { alias, rest } = splitRef(input);
  const normalized = relativePath(rest.join("/"));
  if (!/\.mdx?$/u.test(normalized)) {
    throw new CliError("A source document ID must end in .md or .mdx.");
  }
  return { alias, relativePath: normalized, canonicalId: `@${alias}/${normalized}` };
}

export function parseSourceTopicFilter(input: string): { alias: string; subdir: string | null } {
  const { alias, rest } = splitRef(input);
  return { alias, subdir: rest.length === 0 ? null : normalizeSourceSubdir(rest.join("/")) };
}

export function matchesDocumentTopic(
  doc: Pick<ParsedDocument, "topic" | "llmdocPath" | "sourceName" | "sourceRelativePath">,
  topicFilter: string
): boolean {
  if (!isSourceRef(topicFilter)) return !doc.sourceName && doc.topic === topicFilter;
  const { alias, subdir } = parseSourceTopicFilter(topicFilter);
  return doc.sourceName === alias && (subdir === null || doc.sourceRelativePath === subdir ||
    doc.sourceRelativePath?.startsWith(`${subdir}/`) === true);
}
