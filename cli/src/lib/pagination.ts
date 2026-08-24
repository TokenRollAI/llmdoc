import { DEFAULT_BUDGET, DEFAULT_LIMIT } from "./constants.js";
import { CliError } from "./errors.js";
import { OutputOptions, PaginationResult } from "../types.js";

interface PaginateInput<T> {
  items: T[];
  estimate(item: T): number;
  options: OutputOptions;
}

interface CursorPayload {
  offset: number;
}

export interface PaginationMetadata {
  totalItems: number;
  returnedItems: number;
  totalEstimatedTokens: number;
  returnedEstimatedTokens: number;
  nextCursor: string | null;
}

export function paginate<T>({ items, estimate, options }: PaginateInput<T>): PaginationResult<T> {
  const totalEstimatedTokens = items.reduce((sum, item) => sum + estimate(item), 0);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const budget = options.budget ?? DEFAULT_BUDGET;
  const offset = decodeCursor(options.cursor);

  if (offset < 0 || offset > items.length) {
    throw new CliError("cursor 非法或已失效。");
  }

  const selected: T[] = [];
  let usedBudget = 0;
  let index = offset;

  while (index < items.length && selected.length < limit) {
    const item = items[index];
    const itemBudget = estimate(item);
    const nextBudget = usedBudget + itemBudget;

    if (selected.length > 0 && nextBudget > budget) {
      break;
    }

    selected.push(item);
    usedBudget = nextBudget;
    index += 1;
  }

  if (selected.length === 0 && items[offset]) {
    selected.push(items[offset]);
    usedBudget = estimate(items[offset]);
    index = offset + 1;
  }

  return {
    items: selected,
    totalItems: items.length,
    returnedItems: selected.length,
    totalEstimatedTokens,
    returnedEstimatedTokens: usedBudget,
    nextCursor: index < items.length ? encodeCursor({ offset: index }) : null
  };
}

export function paginationMetadata<T>(result: PaginationResult<T>): PaginationMetadata {
  return {
    totalItems: result.totalItems,
    returnedItems: result.returnedItems,
    totalEstimatedTokens: result.totalEstimatedTokens,
    returnedEstimatedTokens: result.returnedEstimatedTokens,
    nextCursor: result.nextCursor
  };
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  try {
    const payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorPayload;
    if (!Number.isInteger(payload.offset) || payload.offset < 0) {
      throw new Error("cursor offset invalid");
    }
    return payload.offset;
  } catch {
    throw new CliError("cursor 非法或已损坏。");
  }
}
