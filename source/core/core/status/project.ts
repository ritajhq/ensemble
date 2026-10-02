import type * as Deploy from "../deploy/index.ts";

/** Where a vendored kit or library comes from — its own git repository, checked out at `ref` (see `.ensemble/vendor.lock.yml`). */
export interface Vendoring {
  readonly repo: string;
  readonly ref: string;
}

/** An app under `source/apps/`, as declared by `build.<name>` in `.ensemble/config.yaml`. */
export interface App {
  readonly name: string;
  readonly kit: string;
  readonly target?: string;
}

export const KIT_ROLES = ["build", "pack", "deploy", "lib"] as const;
export type KitRole = typeof KIT_ROLES[number];

/** A kit installed under `.ensemble/kits/<role>/<name>` — authored in this project, or vendored from its own repository. */
export interface Kit {
  readonly name: string;
  readonly role: KitRole;
  /** Repo-relative path to the kit's directory. */
  readonly path: string;
  readonly vendored?: Vendoring;
}

/** A library `ens release` publishes: a core library (`source/core/<name>`) or a portable one (`source/libs/<name>`). */
export interface Library {
  readonly name: string;
  readonly package: string;
  readonly scope: "core" | "libs";
  /** Repo-relative path to the library's directory. */
  readonly path: string;
  /** The lib kits it publishes through. */
  readonly kits: readonly string[];
  readonly vendored?: Vendoring;
}

/** A ship a workload's `release:` block packs, and the pack kit it packs with. */
export interface Ship {
  readonly name: string;
  readonly kit: string;
}

/** A workload under `ci/<name>/`, summarised from its delivery manifest. */
export interface Workload {
  readonly name: string;
  /** Repo-relative path to its delivery manifest. */
  readonly manifest: string;
  readonly ships: readonly Ship[];
  /** Declared resource names per deploy category, for the categories it uses. */
  readonly resources: Partial<Record<Deploy.Category, readonly string[]>>;
}
