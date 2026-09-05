import type { JsonValue } from "./json.ts";

/**
 * The only identity/access category kind this spec declares. IAM
 * roles/service accounts are deliberately excluded — a translator derives
 * required permissions automatically from which resources a workload's
 * compute spec already references, rather than the developer declaring
 * grants directly. See taxonomy doc.
 */
export type SecretKind = "secret";

/** Secrets Manager, Secret Manager, Key Vault — a reference the workload mounts/injects as env. */
export interface Secret {
  type: "secret";
  class?: string;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see storage.ts's StorageBase.overrides. */
  overrides?: Record<string, JsonValue>;
}
