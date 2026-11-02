import { dirname, join } from "@std/path";
import { ensureDir } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";

const ctx = KitSdk.Pack.getContext();
const ship = parseYaml(
  await Deno.readTextFile(join(ctx.ship, "ship.yml")),
) as { apps: string[] };

// A nested ship's name has folders in it.
const archive = join(ctx.packages, `${ctx.outputName}.tar.gz`);
await ensureDir(dirname(archive));

const { code } = await new Deno.Command("tar", {
  args: [
    "czf",
    archive,
    ...ship.apps.flatMap((app) => ["-C", join(ctx.artifacts, app), "."]),
  ],
}).spawn().status;
Deno.exit(code);
