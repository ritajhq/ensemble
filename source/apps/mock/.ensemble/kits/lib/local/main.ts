import * as KitSdk from "@ensemble/kit-sdk";

/** Stands in for a registry: a release here publishes nothing. */
await KitSdk.Lib.run({
  authorize: () => Promise.resolve(),
  stamp: () => Promise.resolve(),
  publish: () => Promise.resolve(),
});
