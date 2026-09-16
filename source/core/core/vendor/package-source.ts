/** A request opened by `PackageSource.proposeChange` to merge a local change upstream. */
export interface PullRequestRef {
  readonly url: string;
}

/**
 * The version-control operations vendoring needs from a package's remote
 * source — named for what each accomplishes for a package manager, not for
 * the commands a concrete implementation happens to run underneath (see
 * `GitPackageSource`). Shared by every vendoring operation that touches a
 * real remote: `KitInstaller` (`fetch`, inbound), `LibEjector`
 * (`flattenHistory`/`publishTo`, outbound), `VendorContribute`
 * (`proposeChange`, either direction), and `KitPinner`/`KitUpdater`
 * (`switchTo`/`availableVersions`, on an already-installed checkout).
 */
export interface PackageSource {
  /** Places a copy of the package at `location` (at `ref`, or its default) into `into`. */
  fetch(location: string, ref: string | undefined, into: string): Promise<void>;
  /** The ref currently checked out at `dir`. */
  currentRef(dir: string): Promise<string>;
  /** Discards `dir`'s history, replacing it with a single fresh snapshot of its current contents — the ejection primitive (Section 1: no history preservation). */
  flattenHistory(dir: string): Promise<void>;
  /** Publishes `dir`'s current contents as a new package at `location`, returning the ref that ended up published there. */
  publishTo(dir: string, location: string): Promise<string>;
  /** Sends `dir`'s locally pending change upstream and opens a request to merge it in. */
  proposeChange(dir: string): Promise<PullRequestRef>;
  /** Moves an already-fetched checkout at `dir` to a different `ref`, pulling fresh refs from its remote first. */
  switchTo(dir: string, ref: string): Promise<void>;
  /** Every tag published at `location`, without needing a local checkout. */
  availableVersions(location: string): Promise<string[]>;
}
