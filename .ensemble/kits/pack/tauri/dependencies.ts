import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";

const ctx = KitSdk.Pack.getDependenciesContext();
const ship = parseYaml(
  await Deno.readTextFile(join(ctx.ship, "ship.yml")),
) as { apps: string[] };

console.log(
  JSON.stringify(
    {
      artifacts: ship.apps.filter((app) => ctx.apps.includes(app)),
    } satisfies KitSdk.Pack.Result,
  ),
);
