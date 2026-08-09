import { join } from "@std/path";
import { $ } from "@david/dax";
import { getKitContext } from "@ensemble/kit-sdk";
import { resolveDenoExecutable } from "@ensemble/core";

const ctx = getKitContext();

const entry = join(ctx.source, "main.ts");
const outFile = join(ctx.out, "main.js");

const modeArgs = ctx.mode === "production" ? ["--minify"] : [];
const watchArgs = ctx.watch ? ["--watch"] : [];
const denoExe = await resolveDenoExecutable();

const result = await $`${denoExe} bundle -q ${entry} -o ${outFile} ${modeArgs} ${watchArgs}`
  .noThrow();

if (result.code === 0) console.log(`built ${ctx.name}`);

Deno.exit(result.code);
