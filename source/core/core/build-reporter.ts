/**
 * How `ens build` reports one build's lifecycle to the terminal — kept
 * behind an interface so a future `--plain` flag can swap in an
 * undecorated implementation (`PlainBuildReporter`) without `runBuild`
 * itself changing at all.
 */
export interface BuildReporter {
  /**
   * Called once, right before spawning the build kit for `name` (a ship/app
   * identifier, e.g. "website/content"). Returns a handle to resolve once
   * that spawn exits — a one-shot build only, never a `--watch` session
   * (which has no single "done" moment to resolve toward).
   */
  building(name: string): BuildProgress;
}

/** A single build's in-flight handle, returned by `BuildReporter.building()` — resolve it exactly once. */
export interface BuildProgress {
  /** The build finished successfully (exit code 0). */
  succeed(): void;
  /** The build failed (a nonzero exit code) — the kit's own error output has already gone to stderr by the time this is called. */
  fail(): void;
}
