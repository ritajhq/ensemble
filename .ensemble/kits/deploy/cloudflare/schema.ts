import type { Database } from "./plan.ts";

/** The one table a key-value table's D1 database holds (`./provisioners/key-value.ts`), created if it isn't there yet. */
export function itemsTable(database: Database): string {
  const keys = [database.partition, ...(database.sort ? [database.sort] : [])]
    .map(quoted);
  return `CREATE TABLE IF NOT EXISTS items (${
    keys.map((key) => `${key} TEXT NOT NULL`).join(", ")
  }, attributes TEXT NOT NULL, PRIMARY KEY (${keys.join(", ")}))`;
}

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
