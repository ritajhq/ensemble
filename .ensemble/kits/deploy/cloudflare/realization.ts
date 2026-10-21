import type * as KitSdk from "@ensemble/kit-sdk";

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
    defaultFor: async () => undefined,
    // deno-lint-ignore require-await
    boundFor: async () => undefined,
    // deno-lint-ignore require-await
    supportsCapability: async () => false,
    // deno-lint-ignore require-await
    knowabilityOf: async () => "static",
  };
}
