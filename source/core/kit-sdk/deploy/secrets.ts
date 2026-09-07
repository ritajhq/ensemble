import type { JsonValue } from "./json.ts";

/**
 * The only identity/access category kind this spec declares. IAM
 * roles/service accounts are deliberately excluded — a translator derives
 * required permissions automatically from which resources a workload's
 * compute spec already references, rather than the developer declaring
 * grants directly. See taxonomy doc.
 */
export type SecretKind = "secret";

/**
 * Where a secret's value comes from at deploy time. `file` (default) reads
 * it from a local file the pipeline places; `environment` reads it from the
 * deploy process's own environment (the env var named after the secret) —
 * the same "pipeline supplies the value" model as `variables`, but kept a
 * secret (never surfaced as a plain container env var; see the kit's own
 * translation). Unlike a `variable`, a secret is always delivered to a
 * container as a mounted file at its `${secrets.<name>.path}`, so a `_FILE`-
 * aware image reads it via e.g. `POSTGRES_PASSWORD_FILE: ${secrets.db.path}`.
 */
export type SecretSource = "file" | "environment";

/** Secrets Manager, Secret Manager, Key Vault — a reference the workload mounts as a file. */
export interface Secret {
  type: "secret";
  class?: string;
  /** Defaults to `file`. See SecretSource. */
  source?: SecretSource;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see storage.ts's StorageBase.overrides. */
  overrides?: Record<string, JsonValue>;
}
