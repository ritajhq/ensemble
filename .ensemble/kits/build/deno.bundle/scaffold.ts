import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { getScaffoldKitContext } from "@ensemble/kit-sdk";

const ctx = getScaffoldKitContext();
await ensureDir(ctx.dest);

await Deno.writeTextFile(
  join(ctx.dest, "deno.json"),
  JSON.stringify({ imports: {} }, null, 2) + "\n",
);

await Deno.writeTextFile(
  join(ctx.dest, "main.ts"),
  `console.log("Hello, world from ${ctx.name}!");\n`,
);

console.log(`scaffolded ${ctx.name}`);
