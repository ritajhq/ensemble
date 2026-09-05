import type { JsonValue } from "./json.ts";

/** Every database kind this spec understands. Wide-column/analytical stores are a known, unmodeled gap — see taxonomy doc. */
export type DatabaseKind = "relational" | "key-value" | "document" | "cache";

interface DatabaseBase {
  class?: string;
  engine?: string;
  version?: string;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see storage.ts's StorageBase.overrides. */
  overrides?: Record<string, JsonValue>;
}

/** Engine + version + size/tier (RDS/Aurora, Cloud SQL, Azure Database for Postgres/MySQL). */
export interface Relational extends DatabaseBase {
  type: "relational";
}

/**
 * Deliberately the SAFE PORTABLE SUBSET only — put/get/delete/scan-by-prefix.
 * Does NOT attempt to unify DynamoDB's full data model (secondary indexes,
 * batch ops, conditional writes, single-table design) — a workload needing
 * those isn't fully served by this abstraction. See taxonomy doc.
 */
export interface KeyValue extends DatabaseBase {
  type: "key-value";
}

/** Query/filter by field, indexes (MongoDB Atlas, Firestore, Cosmos DB SQL API, DynamoDB used document-style). Kept separate from KeyValue since this capability can't be satisfied by a KV-only local fallback. */
export interface Document extends DatabaseBase {
  type: "document";
}

/** Connection string + engine choice (ElastiCache, Memorystore, Azure Cache for Redis). */
export interface Cache extends DatabaseBase {
  type: "cache";
}

export type Database = Relational | KeyValue | Document | Cache;
