/**
 * A `key-value` table's key: the attribute every item is partitioned by,
 * and optionally the one that orders items within a partition. Both are
 * string-valued attribute names; their value type is the realization's
 * call (every target here stores them as strings).
 */
export interface KeySchema {
  readonly partition: string;
  readonly sort?: string;
}

export class KeySchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeySchemaError";
  }
}

const KNOWN_KEYS = new Set(["partition", "sort"]);

/** Parses and strictly validates a `key-value` resource's `keySchema` param — unknown keys and non-string attribute names are rejected, not ignored. Throws `KeySchemaError` naming the first violation. */
export function parseKeySchema(raw: unknown): KeySchema {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new KeySchemaError("keySchema must be a mapping.");
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new KeySchemaError(
        `keySchema has no key "${key}" (expected partition, sort).`,
      );
    }
  }
  if (typeof record.partition !== "string" || record.partition.length === 0) {
    throw new KeySchemaError(
      `keySchema requires "partition" as a non-empty attribute name.`,
    );
  }
  if (record.sort === undefined) return { partition: record.partition };
  if (typeof record.sort !== "string" || record.sort.length === 0) {
    throw new KeySchemaError(
      `keySchema "sort", when given, must be a non-empty attribute name.`,
    );
  }
  if (record.sort === record.partition) {
    throw new KeySchemaError(
      `keySchema "sort" must name a different attribute than "partition".`,
    );
  }
  return { partition: record.partition, sort: record.sort };
}
