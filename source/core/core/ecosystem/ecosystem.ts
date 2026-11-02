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

/** How to run a language's own tool against this project. */
export interface Invocation {
  readonly args: readonly string[];
  /** Where to run it from, when that's what finds the root files. Otherwise wherever the caller is. */
  readonly cwd?: string;
}

/**
 * What `ens` needs from a language's packaging, without knowing its manifests
 * or lockfiles. An ecosystem acts only on the packages it recognizes, so a
 * project mixing several can tell each of them the same thing.
 */
export interface Ecosystem {
  /** Writes the files a new project needs, under `.ensemble/ecosystems/<name>`. */
  initialize(): Promise<void>;
  /** Brings anything derived from the packages on disk up to date. Cheap when nothing changed, since it runs ahead of every build. */
  sync(): Promise<void>;
  /** The package whose manifest sits directly in `directory`, which needn't be a workspace member yet. */
  packageAt(directory: string): Promise<Package | undefined>;
  /**
   * Moves `targets` to `version` and repins every package depending on one, all
   * at once and before any kit runs. Returns the files it changed outside the
   * targets' own directories, which a release commit must also carry.
   */
  stamp(version: string, targets: readonly StampTarget[]): Promise<string[]>;
  /** Creates a new library in `directory` and makes it part of the workspace. */
  scaffoldLibrary(directory: string, name: string): Promise<void>;
  /** The lockfiles that exist, which a release commit must also carry. */
  lockfiles(): Promise<string[]>;
  /** How to run `tool` here, when it's this ecosystem's. */
  invocation(
    tool: string,
    args: readonly string[],
  ): Promise<Invocation | undefined>;
}
