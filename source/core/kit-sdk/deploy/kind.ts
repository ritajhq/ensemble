import type { ComputeKind } from "./compute.ts";
import type { StorageKind } from "./storage.ts";
import type { DatabaseKind } from "./databases.ts";
import type { MessagingKind } from "./messaging.ts";
import type { NetworkingKind } from "./networking.ts";
import type { SecretKind } from "./secrets.ts";
import type { VariableKind } from "./variables.ts";
import type { ExternalKind } from "./external.ts";

/**
 * The full discriminant space routed by `Router` — every compute kind and
 * every resource kind across every category, as one union of distinct
 * strings. One shared registry uses this single space rather than a separate
 * registry per category, so registering a translator for any kind (compute
 * or resource) goes through the same call — see the taxonomy doc's
 * "one mechanism for both" decision. The manifest itself still organizes
 * entries by top-level category (compute/storage/databases/...); this union
 * is purely a routing concern underneath that.
 */
export type Kind =
  | ComputeKind
  | StorageKind
  | DatabaseKind
  | MessagingKind
  | NetworkingKind
  | SecretKind
  | VariableKind
  | ExternalKind;

/**
 * The top-level manifest sections a `Workload` declares entries under — also
 * the qualifier a `Reference` (`${<category>.<name>.<output>}`) names.
 * `external` is the odd one out: its entries are looked up, never
 * provisioned — see external.ts. A runtime array (not just a type union) so
 * `reference.ts` can validate a parsed Reference's category against it
 * directly, rather than keeping a second hardcoded list in sync by hand.
 */
export const CATEGORIES = [
  "compute",
  "storage",
  "databases",
  "messaging",
  "networking",
  "secrets",
  "variables",
  "external",
  "release",
] as const;

export type Category = typeof CATEGORIES[number];
