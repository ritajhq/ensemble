import type { Mode } from "../mode.ts";
import type { Release } from "../release.ts";

/** Whether a release's artifact is actually reachable at its target destination — pulled/pushed, not just a plausible reference string. `detail` carries a human-readable reason when `available` is `false` (e.g. "no such tag in registry"). */
export interface ReleaseAvailability {
  readonly available: boolean;
  readonly detail?: string;
}

/**
 * Asks the pack kit that produced a release what reference it reports for a
 * given deploy mode/version — the seam that replaces guessing the reference
 * format from `Release` fields with asking the actual producer ("producer
 * reports a real string; deploy never encodes format") — and, separately,
 * whether that artifact is actually present where a production apply would
 * need it. The concrete, subprocess-spawning implementation lives in
 * `@ensemble/core`, since kit-sdk has no dependency on it; this port is what
 * lets kit-sdk classes (`ReleaseLocatorResolver`, `ReleaseAvailabilityPreflight`)
 * depend on the capability without depending on how it's carried out.
 */
export interface PackKitGateway {
  describe(
    releaseName: string,
    release: Release,
    mode: Mode,
    version: string,
  ): Promise<string>;

  verify(
    releaseName: string,
    release: Release,
    mode: Mode,
    version: string,
  ): Promise<ReleaseAvailability>;
}
