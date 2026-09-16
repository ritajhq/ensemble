import { join } from "@std/path";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";
import { resolveDenoExecutable, terminateChildrenOnSignal } from "@ensemble/kit-sdk";

const ctx = KitSdk.Build.getContext();

const entry = join(ctx.source, "main.ts");
const outFile = join(ctx.out, "main.js");

const modeArgs = ctx.mode === "production" ? ["--minify"] : [];
const watchArgs = ctx.watch ? ["--watch"] : [];
const denoExe = await resolveDenoExecutable();

const bundle = $`${denoExe} bundle -q ${entry} -o ${outFile} ${modeArgs} ${watchArgs}`
  .noThrow()
  .spawn();
terminateChildrenOnSignal([bundle]);

const result = await bundle;

Deno.exit(result.code);
