import { join } from "@std/path";
import { copy, ensureDir } from "@std/fs";
import { parse as parseToml } from "@std/toml";
import * as KitSdk from "@ensemble/kit-sdk";

const TAURI_CLI = "npm:@tauri-apps/cli@2.12.4";

const ctx = KitSdk.Build.getContext();
if (ctx.watch) throw new Error("tauri: --watch isn't supported by this kit.");

// Stated rather than left to Cargo: without the cargo ecosystem nothing makes
// this crate a member of that workspace, and its target would sit beside it.
const targetDir = Deno.env.get("CARGO_TARGET_DIR") ??
  join(
    await KitSdk.findRepoRoot(ctx.workspace),
    ".ensemble",
    "ecosystems",
    "cargo",
    "target",
  );
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
    "build",
    "--no-bundle",
    ...(ctx.mode === "production" ? [] : ["--debug"]),
  ],
  cwd: ctx.source,
  env: { CARGO_TARGET_DIR: targetDir },
}).spawn().status;
if (code !== 0) Deno.exit(code);

const manifest = parseToml(
  await Deno.readTextFile(join(ctx.source, "Cargo.toml")),
) as { package: { name: string } };
const crate = manifest.package.name;
const profile = ctx.mode === "production" ? "release" : "debug";
await ensureDir(ctx.out);
await copy(join(targetDir, profile, crate), join(ctx.out, crate), {
  overwrite: true,
});
