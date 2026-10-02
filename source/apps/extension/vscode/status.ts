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
}

export type KitRole = "build" | "pack" | "deploy" | "lib";

export interface Kit {
  name: string;
  role: KitRole;
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

export interface Workload {
  name: string;
  manifest: string;
  ships: Ship[];
  resources: Record<string, string[]>;
}
