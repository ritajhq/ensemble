import { dirname, join } from "@std/path";
import { copy, expandGlob } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";

const TAURI_CLI = "npm:@tauri-apps/cli@2.12.4";

const ctx = KitSdk.Pack.getContext();
const ship = parseYaml(
  await Deno.readTextFile(join(ctx.ship, "ship.yml")),
) as { apps: string[]; bundles: string[] };

// The pack contract names the ship and the artifacts, never an app's source:
// the shell's location has to be worked out from the artifacts' own.
const source = dirname(ctx.artifacts);
const shell = join(source, "apps", ship.apps.at(-1)!);

const deno = await KitSdk.resolveDenoExecutable();
const { code } = await new Deno.Command(deno, {
  args: [
    "run",
    "-A",
    "-q",
    TAURI_CLI,
    "bundle",
    "--bundles",
    ship.bundles.join(","),
  ],
  cwd: shell,
}).spawn().status;
if (code !== 0) Deno.exit(code);

const targetDir = Deno.env.get("CARGO_TARGET_DIR") ?? join(source, "target");
for (const bundle of ship.bundles) {
  const built = expandGlob(`*.${bundle}`, {
    root: join(targetDir, "release", "bundle", bundle),
  });
  for await (const file of built) {
    await copy(file.path, join(ctx.packages, file.name), { overwrite: true });
  }
}
