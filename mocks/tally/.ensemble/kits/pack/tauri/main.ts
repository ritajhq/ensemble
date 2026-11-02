import { join } from "@std/path";
import { copy, expandGlob } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";

const TAURI_CLI = "npm:@tauri-apps/cli@2.12.4";

const ctx = KitSdk.Pack.getContext();
const ship = parseYaml(
  await Deno.readTextFile(join(ctx.ship, "ship.yml")),
) as { apps: string[]; bundles: string[] };

const shell = join(ctx.workspace, "apps", ship.apps.at(-1)!);

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
    ...(ctx.version
      ? ["--config", JSON.stringify({ version: ctx.version.replace(/^v/, "") })]
      : []),
  ],
  cwd: shell,
}).spawn().status;
if (code !== 0) Deno.exit(code);

const targetDir = Deno.env.get("CARGO_TARGET_DIR") ??
  join(ctx.workspace, "target");
for (const bundle of ship.bundles) {
  const built = expandGlob(`*.${bundle}`, {
    root: join(targetDir, "release", "bundle", bundle),
  });
  for await (const file of built) {
    await copy(file.path, join(ctx.packages, file.name), { overwrite: true });
  }
}
