import * as KitSdk from "@ensemble/kit-sdk";
import { referencedApps } from "./referenced-apps.ts";

// Read-only: reports which of the candidate apps this ship's Dockerfile
// actually references (via `COPY --from=<app>`), without building or
// packing anything — the same question main.ts answers for itself while
// packing, asked up front so ens knows which apps' builds it needs to run
// first.
const ctx = KitSdk.Pack.getDependenciesContext();
const dependencies = await referencedApps(ctx.ship, ctx.apps);

console.log(
  JSON.stringify({ artifacts: dependencies } satisfies KitSdk.Pack.Result),
);
