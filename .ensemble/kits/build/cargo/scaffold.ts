import { basename, dirname } from "@std/path";
import { ensureDir } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";

// `ens` lists the new crate in the workspace once this is done, through the
// cargo ecosystem kit's sync.
const ctx = KitSdk.Scaffold.getContext();
await ensureDir(dirname(ctx.dest));
const { code } = await new Deno.Command("cargo", {
  args: [
    "new",
    "--quiet",
    "--vcs",
    "none",
    "--name",
    basename(ctx.name),
    ctx.dest,
  ],
}).spawn().status;
Deno.exit(code);
