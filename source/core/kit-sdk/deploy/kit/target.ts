import type { Kit } from "./kit.ts";

/**
 * Where a deploy is aimed: a kit + its config + its bounds, chosen by the
 * runner (Section 2) — there is no `production`/`stage` concept inside ens,
 * only targets. Minimal for now (just the `Kit`); Phase 4's kit-config
 * layering (Section 10) will extend this once it exists, not before.
 */
export interface Target {
  readonly kit: Kit;
}
