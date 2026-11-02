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
const repoRoot = await KitSdk.findRepoRoot(ctx.workspace);

// Cargo's target directory outlives a run, and every version's bundles would
// otherwise be packaged alongside this one's.
const targetDir = Deno.env.get("CARGO_TARGET_DIR") ??
  join(repoRoot, ".ensemble", "ecosystems", "cargo", "target");
const bundles = join(targetDir, "release", "bundle");
await Deno.remove(bundles, { recursive: true }).catch(() => {});

const deno = await KitSdk.resolveDenoExecutable();
const { code } = await new Deno.Command(deno, {
  args: [
    "run",
    "-A",
    "-q",
    // This tool is the kit's, not the project's: run from inside the project,
    // it would otherwise write itself into a Deno workspace's lockfile.
    "--no-config",
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

for (const bundle of ship.bundles) {
  const built = expandGlob(`*.${bundle}`, {
    root: join(bundles, bundle),
  });
  for await (const file of built) {
    await copy(file.path, join(ctx.packages, file.name), { overwrite: true });
  }
}
