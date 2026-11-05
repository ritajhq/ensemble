import { join } from "@std/path";
import { copy, ensureDir, expandGlob } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";
import { ShipConfig } from "./ship-config.ts";
import { type Profile, Shell } from "./shell.ts";
import { BinaryWatch } from "./binary-watch.ts";

const ctx = KitSdk.Pack.getContext();
const config = await ShipConfig.read(ctx.ship);
const repoRoot = await KitSdk.findRepoRoot(ctx.workspace);
const shell = new Shell(
  join(ctx.workspace, "apps", config.shell),
  repoRoot,
  config.frontend ? join(ctx.artifacts, config.frontend) : undefined,
  ctx.version,
);

/** Written where `describe.ts` says: a file for `binary`, a folder of bundles for `installer`. */
const output = join(ctx.packages, ctx.outputName);

/** A debug build is quick to repeat, which is what a developer wants while the app is being watched or `vars.profile` says so. */
const profile: Profile = ctx.vars.profile === "debug" || ctx.watch ? "debug" : "release";

async function binary(): Promise<void> {
  if (ctx.watch) {
    await new BinaryWatch(shell, output).run();
    return;
  }
  await shell.publish(await shell.compile(profile), output);
}

async function installer(): Promise<void> {
  if (ctx.watch) throw new Error("tauri: --watch is for binary mode; an installer is not rebuilt on every change.");
  if (config.bundles.length === 0) throw new Error(`tauri.yml: "bundles" is required for installer mode.`);
  const bundles = await shell.bundle(config.bundles);
  await ensureDir(output);
  for (const bundle of config.bundles) {
    for await (const file of expandGlob(`*.${bundle}`, { root: join(bundles, bundle) })) {
      await copy(file.path, join(output, file.name), { overwrite: true });
    }
  }
}

await ({ binary, installer } as Record<string, () => Promise<void>>)[ctx.mode]();
