import * as KitSdk from "@ensemble/kit-sdk";
import { ShipConfig } from "./ship-config.ts";

// The only build an app depends on is the one it embeds: the shell is source (the crate), not a build.
const ctx = KitSdk.Pack.getDependenciesContext();
const config = await ShipConfig.read(ctx.ship);

console.log(
  JSON.stringify(
    {
      artifacts: config.frontend && ctx.apps.includes(config.frontend) ? [config.frontend] : [],
    } satisfies KitSdk.Pack.Result,
  ),
);
