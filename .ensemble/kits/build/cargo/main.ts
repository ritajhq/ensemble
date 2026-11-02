import { join } from "@std/path";
import { copy, ensureDir } from "@std/fs";
import { parse as parseToml } from "@std/toml";
import * as KitSdk from "@ensemble/kit-sdk";

const ctx = KitSdk.Build.getContext();
if (ctx.watch) throw new Error("cargo: --watch isn't supported by this kit.");

const repoRoot = await KitSdk.findRepoRoot(ctx.workspace);
const cargoRoot = join(repoRoot, ".ensemble", "ecosystems", "cargo");
const manifest = parseToml(
  await Deno.readTextFile(join(ctx.source, "Cargo.toml")),
) as { package: { name: string } };
const crate = manifest.package.name;
const profile = ctx.mode === "production" ? "release" : "debug";

const { code } = await new Deno.Command("cargo", {
  args: [
    "build",
    "--quiet",
    "--package",
    crate,
    ...(ctx.mode === "production" ? ["--release"] : []),
  ],
  cwd: cargoRoot,
}).spawn().status;
if (code !== 0) Deno.exit(code);

const targetDir = Deno.env.get("CARGO_TARGET_DIR") ?? join(cargoRoot, "target");
await ensureDir(ctx.out);
await copy(join(targetDir, profile, crate), join(ctx.out, crate), {
  overwrite: true,
});
