import * as KitSdk from "@ensemble/kit-sdk";

/** What each contract is held in here: the technologies a developer may pin, and the default when nobody does. */
const ENGINES = new KitSdk.Deploy.Engines({
  "databases.key-value": { provides: ["d1"], default: "d1" },
  "storage.object-storage": { provides: ["r2"], default: "r2" },
});

/**
 * The cloudflare kit's realization: nothing to expand a class into (Workers,
 * D1 and R2 are sized by use, not provisioned), no capabilities beyond the
 * contracts', and every output known when the plan is rendered — names are
 * the manifest's own, addresses follow from the account and the bucket.
 */
// deno-lint-ignore require-await
export async function cloudflareRealization(): Promise<
  KitSdk.Deploy.Realization
> {
  return {
    // deno-lint-ignore require-await
    classPreset: async () => undefined,
    // deno-lint-ignore require-await
    defaultFor: async (category, type, concern) =>
      ENGINES.defaultFor(category, type, concern),
    // deno-lint-ignore require-await
    enginesFor: async (category, type) => ENGINES.provides(category, type),
    // deno-lint-ignore require-await
    boundFor: async () => undefined,
    // deno-lint-ignore require-await
    supportsCapability: async () => false,
    // deno-lint-ignore require-await
    knowabilityOf: async () => "static",
  };
}
