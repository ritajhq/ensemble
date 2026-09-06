import type { Compute } from "./compute.ts";
import type { Storage } from "./storage.ts";
import type { Database } from "./databases.ts";
import type { Messaging } from "./messaging.ts";
import type { Networking } from "./networking.ts";
import type { Secret } from "./secrets.ts";
import type { Variable } from "./variables.ts";
import type { External } from "./external.ts";
import type { Release } from "./release.ts";

/**
 * A parsed workload manifest — one top-level key per `Category`, each a
 * mapping keyed by entry name (no wrapping `resources:` array, no redundant
 * `name:` field on the entry itself — see taxonomy doc: category is the
 * organizing unit in the manifest, `type` is just a field within it). The
 * map key IS the name a `${category.name.output}` Reference addresses.
 * `compute` may be empty or omitted (e.g. a static site composed purely of a
 * `storage` entry and a `networking` cdn entry referencing it), or hold
 * several entries (e.g. an API service and a worker process sharing the
 * same databases). `external` is the one category nothing here provisions —
 * see external.ts — kept alongside the rest so referencing it goes through
 * the same `${external.name.output}` mechanism as everything else.
 */
export interface Workload {
  compute?: Record<string, Compute>;
  storage?: Record<string, Storage>;
  databases?: Record<string, Database>;
  messaging?: Record<string, Messaging>;
  networking?: Record<string, Networking>;
  secrets?: Record<string, Secret>;
  /** Non-sensitive config inputs, declared valueless and supplied at deploy time — see variables.ts. Referenced via `${variables.<name>.value}`. */
  variables?: Record<string, Variable>;
  external?: Record<string, External>;
  /** How to pack each ship this workload's compute entries reference via `${release.<name>.image}` — see release.ts. */
  release?: Record<string, Release>;
}
