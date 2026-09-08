import type { JsonValue } from "./json.ts";
import type { Referenceable } from "./reference.ts";

/** Every database kind this spec understands. Wide-column/analytical stores are a known, unmodeled gap — see taxonomy doc. */
export type DatabaseKind = "relational" | "key-value" | "document" | "cache";

interface DatabaseBase {
  class?: string;
  engine?: string;
  version?: string;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see storage.ts's StorageBase.overrides. */
  overrides?: Record<string, JsonValue>;
}

/**
 * Engine + version + size/tier (RDS/Aurora, Cloud SQL, Azure Database for
 * Postgres/MySQL). Its credentials are inputs to provisioning it AND feed the
 * outputs consumers read (`host`/`port`/`user`/`database`, plus
 * `connectionString` when the password is a plain value). `user`/`database`
 * are `Referenceable` so they can come from a `${variables.*.value}`;
 * `passwordSecret` names a declared `secrets` entry, delivered to the engine
 * via its `*_PASSWORD_FILE` convention (never a plain env var) — so a secret
 * password is never surfaced in `connectionString`.
 */
export interface Relational extends DatabaseBase {
  type: "relational";
  /** Superuser/owner name — engine's `POSTGRES_USER` / equivalent. Defaults to "ensemble". */
  user?: Referenceable;
  /** Initial database name. Defaults to the entry's own name. */
  database?: Referenceable;
  /** Name of a declared `secrets` entry holding the password, delivered via `*_PASSWORD_FILE`. Omitted → a fixed local dev password. */
  passwordSecret?: string;
  /** Repo-relative SQL/script files, mounted read-only into the engine's init dir (Postgres `/docker-entrypoint-initdb.d`) and run once on first initialization. */
  init?: string[];
}

/**
 * How a key-value entry partitions and orders its items, in store-agnostic
 * terms: `partition` is the attribute items are grouped/sharded by (DynamoDB's
 * partition key, Cassandra's partition key, Bigtable's row key, Cosmos DB's
 * partition key), and the optional `sort` orders items within a partition
 * (DynamoDB's sort key, Cassandra's clustering column). Both name an attribute;
 * a target's own provisioning specifics — DynamoDB attribute types, billing
 * mode, secondary indexes — are that kit's concern (via `overrides`), not part
 * of this portable shape.
 */
export interface KeySchema {
  partition: string;
  sort?: string;
}

/**
 * Deliberately the SAFE PORTABLE SUBSET only — put/get/delete/scan-by-prefix.
 * Does NOT attempt to unify DynamoDB's full data model (secondary indexes,
 * batch ops, conditional writes, single-table design) — a workload needing
 * those isn't fully served by this abstraction. See taxonomy doc. A kit that
 * provisions the store (e.g. the `aws` kit creating a DynamoDB table) reads
 * `keySchema`; a kit that runs a local KV server (e.g. compose → valkey) may
 * ignore it.
 */
export interface KeyValue extends DatabaseBase {
  type: "key-value";
  keySchema?: KeySchema;
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
