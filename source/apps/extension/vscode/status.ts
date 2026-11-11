import type * as KitRoles from "@ensemble/core/kit-roles";

/** The `ens status --json` document (see the CLI's `status/json.ts`) — the extension reads it, never re-derives it. */
export interface Document {
  version: 1;
  apps: App[];
  kits: Kit[];
  libraries: Library[];
  workloads: Workload[];
}

export interface Vendoring {
  repo: string;
  ref: string;
}

export interface App {
  name: string;
  kit: string;
  target?: string;
  /** Set for an integration (`integrations/<kit>/<app>`): the deploy kit it's wired for and the app it wires. */
  integration?: { kit: string; app: string };
}

export interface Kit {
  name: string;
  role: KitRoles.Role;
  path: string;
  vendored?: Vendoring;
}

export interface Library {
  name: string;
  package: string;
  scope: "core" | "libs";
  path: string;
  kits: string[];
  vendored?: Vendoring;
}

export interface Ship {
  name: string;
  kit: string;
}

export interface Operation {
  name: string;
  command: string;
  arguments: string[];
}

export interface Workload {
  name: string;
  manifest: string;
  ships: Ship[];
  resources: Record<string, string[]>;
  operations: Operation[];
}
