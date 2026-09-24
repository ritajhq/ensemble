import type {
  ExternalDeclaration,
  ResourceDeclaration,
  SecretDeclaration,
  VariableDeclaration,
} from "./resource.ts";
import type { Release } from "./release.ts";
import type { Task } from "./task.ts";

/** The fixed top-level categories a manifest's `deploy:` block may hold — see the plan's ubiquitous-language glossary. Adding a Type does not touch this list; adding a Category would (and none is anticipated). */
export const CATEGORIES = [
  "compute",
  "storage",
  "databases",
  "messaging",
  "networking",
  "secrets",
  "variables",
  "external",
] as const;

export type Category = typeof CATEGORIES[number];

/**
 * The aggregate root parsed from a manifest (`delivery.yml`) — one map per
 * `Category`, keyed by resource name, plus the sibling `release:` block built
 * by pack kits (out of scope; kept parseable so `ens release` keeps working
 * and computes can reference a release's primary output — Section 12) and the
 * sibling `tasks:` map (`./task.ts`: operator commands, deliberately not a
 * `Category` — nothing provisions them, nothing references them).
 */
export interface Workload {
  readonly release?: Readonly<Record<string, Release>>;
  readonly tasks?: Readonly<Record<string, Task>>;
  readonly compute?: Readonly<Record<string, ResourceDeclaration>>;
  readonly storage?: Readonly<Record<string, ResourceDeclaration>>;
  readonly databases?: Readonly<Record<string, ResourceDeclaration>>;
  readonly messaging?: Readonly<Record<string, ResourceDeclaration>>;
  readonly networking?: Readonly<Record<string, ResourceDeclaration>>;
  readonly secrets?: Readonly<Record<string, SecretDeclaration>>;
  readonly variables?: Readonly<Record<string, VariableDeclaration>>;
  readonly external?: Readonly<Record<string, ExternalDeclaration>>;
}
