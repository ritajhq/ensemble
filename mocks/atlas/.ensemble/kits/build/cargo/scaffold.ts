import { basename, dirname } from "@std/path";
import { ensureDir } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";

// `cargo new` also lists the crate in the enclosing workspace's `members`.
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
