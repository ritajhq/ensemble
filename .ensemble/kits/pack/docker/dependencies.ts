import * as KitSdk from "@ensemble/kit-sdk";
import { referencedApps } from "./referenced-apps.ts";
import { ReferencedPacks } from "./referenced-packs.ts";

// Read-only: reports which of the candidate apps this ship's Dockerfile
// actually references (via `COPY --from=<app>`), and which packs it copies
// from (via `COPY --from=pack/<ship>/<kit>`), without building or packing
// anything — the same question main.ts answers for itself while packing,
// asked up front so ens knows which builds and packs it needs to run first.
const ctx = KitSdk.Pack.getDependenciesContext();
const dependencies = await referencedApps(ctx.ship, ctx.apps);
const packs = await ReferencedPacks.read(ctx.ship);

console.log(
  JSON.stringify(
    { artifacts: dependencies, packs } satisfies KitSdk.Pack.Result,
  ),
);
