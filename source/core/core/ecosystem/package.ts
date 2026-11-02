/** A dependency a package takes on another package in the same repository, rather than on a published release. */
export interface Link {
  /** What the package calls it in its manifest. */
  readonly specifier: string;
  /** The name of the package it links to. */
  readonly target: string;
}

/** One unit an ecosystem builds and publishes: a Deno workspace member, a Cargo crate. */
export interface Package {
  /** Absent for a package that doesn't publish under a name, e.g. a Deno app. */
  readonly name?: string;
  readonly directory: string;
  readonly links: readonly Link[];
}

/** A package a release moves to a new version. */
export interface StampTarget {
  readonly name: string;
  readonly directory: string;
}
