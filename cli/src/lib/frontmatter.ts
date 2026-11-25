import { createRequire } from "node:module";
import { CliError } from "./errors.js";

// Resolve the YAML reader/writer owned by gray-matter even with an unhoisted install.
// Calling it directly keeps input and rewrite output completely out of gray-matter's language dispatch.
const require = createRequire(import.meta.url);
const yaml: {
  JSON_SCHEMA: unknown;
  safeLoad(text: string, options: { schema: unknown }): unknown;
  safeDump(value: unknown, options: { lineWidth?: number; noRefs?: boolean; skipInvalid?: boolean }): string;
} = createRequire(require.resolve("gray-matter"))("js-yaml");

export interface ParsedFrontmatterResult {
  hasFrontmatter: boolean;
  data: Record<string, unknown>;
  content: string;
}

export function parseYamlFrontmatter(raw: string): ParsedFrontmatterResult {
  const text = raw.replace(/^\uFEFF/u, "");
  if (/^---[ \t]*[a-zA-Z][^\r\n]*(?:\r?\n|$)/u.test(text)) {
    throw new CliError("Unsupported front matter engine; only plain YAML front matter is allowed.");
  }
  const opening = /^---\r?\n/u.exec(text);
  if (opening) {
    const rest = text.slice(opening[0].length);
    const closing = /(?:^|\n)---(?:\r?\n|$)/u.exec(rest);
    if (closing) {
      const yamlBlock = rest.slice(0, closing.index);
      let data: unknown;
      try {
        data = yaml.safeLoad(yamlBlock, { schema: yaml.JSON_SCHEMA }) ?? {};
      } catch (error) {
        const message = (error as Error).message;
        if (/(?:^|\n)\s*(?:-\s+|[A-Za-z0-9_-]+:\s+)@/u.test(yamlBlock)) {
          throw new CliError(
            `${message} (Hint: YAML values starting with "@" must be quoted, e.g. "@team/doc.md")`
          );
        }
        throw error;
      }
      if (
        typeof data !== "object" ||
        data === null ||
        (Object.getPrototypeOf(data) !== Object.prototype && Object.getPrototypeOf(data) !== null)
      ) {
        throw new CliError("YAML front matter must be a mapping.");
      }
      return {
        hasFrontmatter: true,
        data: data as Record<string, unknown>,
        content: rest.slice(closing.index + closing[0].length)
      };
    }
  }
  return { hasFrontmatter: false, data: {}, content: raw };
}

export function stringifyYamlFrontmatter(data: Record<string, unknown>, body: string): string {
  const dumped = yaml.safeDump(data, { lineWidth: -1, noRefs: true, skipInvalid: true }).trimEnd();
  const normalizedBody = body.replace(/^\r?\n+/, "");
  return normalizedBody ? `---\n${dumped}\n---\n\n${normalizedBody.replace(/\r?\n?$/, "\n")}` : `---\n${dumped}\n---\n`;
}
