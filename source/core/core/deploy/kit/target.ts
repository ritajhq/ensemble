import type { Kit } from "./kit.ts";

/**
 * Where a deploy is aimed: a kit + its config + its bounds, chosen by the
 * runner (Section 2) — there is no `production`/`stage` concept inside ens,
 * only targets. `runtime` is the target config's effective selection value
 * (its `selection.runtime` key, already resolved by whoever built this
 * `Target` — `KitLoader` today); `undefined` when the kit's config declares
 * none. Opaque to everything except a kit's own `Provisioner.matches()`.
 */
export interface Target {
  readonly kit: Kit;
  readonly runtime?: string;
}
