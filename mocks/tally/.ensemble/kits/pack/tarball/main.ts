import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";

const ctx = KitSdk.Pack.getContext();
const ship = parseYaml(
  await Deno.readTextFile(join(ctx.ship, "ship.yml")),
) as { apps: string[] };

const { code } = await new Deno.Command("tar", {
  args: [
    "czf",
    join(ctx.packages, `${ctx.outputName}.tar.gz`),
    ...ship.apps.flatMap((app) => ["-C", join(ctx.artifacts, app), "."]),
  ],
}).spawn().status;
Deno.exit(code);
