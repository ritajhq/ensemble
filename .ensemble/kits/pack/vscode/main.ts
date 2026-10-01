import { join } from "@std/path";
import { copy, emptyDir, exists } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";
import { Vsce } from "./vsce.ts";

// Assembles an unpacked extension folder VS Code can load directly (e.g. via
// --extensionDevelopmentPath): the ship's extension.json manifest, renamed to
// the package.json VS Code requires, next to the same-named app's build output.
// The vsix mode then zips that folder into an installable package.
const ctx = KitSdk.Pack.getContext();

const manifest = join(ctx.ship, "extension.json");
if (!await exists(manifest, { isFile: true })) {
  throw new Error(`Missing extension.json at ${manifest}`);
}

const build = join(ctx.artifacts, ctx.name);
if (!await exists(build, { isDirectory: true })) {
  throw new Error(`App "${ctx.name}" has no build output (expected ${build})`);
}

const folder = join(ctx.packages, ctx.outputName);
await emptyDir(folder);
await copy(build, folder, { overwrite: true });
await Deno.copyFile(manifest, join(folder, "package.json"));

if (ctx.mode !== "vsix") Deno.exit(0);

const vsce = await Vsce.resolve();
Deno.exit(await vsce.package(folder, `${folder}.vsix`));
