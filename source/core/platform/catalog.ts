import type { Manifest } from "./manifest.ts";

/** A `ci/<name>` directory whose manifest couldn't be read, and why. */
export interface Problem {
  readonly manifest: string;
  readonly message: string;
}

/**
 * What one commit of a project offers: its delivery manifests, the ones that
 * don't parse (kept, so a typo in one manifest never hides the others), and
 * the deploy kits a deploy may choose between.
 */
export class Catalog {
  constructor(
    readonly commit: string,
    readonly manifests: readonly Manifest[],
    readonly problems: readonly Problem[],
    readonly kits: readonly string[],
  ) {}
}
