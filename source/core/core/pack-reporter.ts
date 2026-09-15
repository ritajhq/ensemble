/**
 * How `ens pack` reports one pack's lifecycle to the terminal — kept behind
 * an interface for the same reason `BuildReporter` is: a future `--plain`
 * flag can swap in an undecorated implementation (`PlainPackReporter`)
 * without `runPack` itself changing at all.
 */
export interface PackReporter {
  /**
   * Called once, right before spawning the pack kit for `name` (a ship
   * identifier, e.g. "website"). Returns a handle to resolve once that
   * spawn exits.
   */
  packing(name: string): PackProgress;
}

/** A single pack's in-flight handle, returned by `PackReporter.packing()` — resolve it exactly once. */
export interface PackProgress {
  /** The pack finished successfully (exit code 0). */
  succeed(): void;
  /** The pack failed (a nonzero exit code) — the kit's own error output has already gone to stderr by the time this is called. */
  fail(): void;
}
