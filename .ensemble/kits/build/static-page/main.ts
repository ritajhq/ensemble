import { join } from "@std/path";
import { copy, ensureDir } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";

const ctx = KitSdk.Build.getContext();
if (ctx.watch) {
  throw new Error("static-page: --watch isn't supported by this kit.");
}

await ensureDir(ctx.out);
await copy(join(ctx.source, "public"), ctx.out, { overwrite: true });

const deno = await KitSdk.resolveDenoExecutable();
const { code } = await new Deno.Command(deno, {
  args: [
    "bundle",
    "-q",
    ...await KitSdk.denoConfigArgs(await KitSdk.findRepoRoot(ctx.workspace)),
    join(ctx.source, "main.ts"),
    "-o",
    join(ctx.out, "main.js"),
  ],
}).spawn().status;
Deno.exit(code);
